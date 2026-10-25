import json
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
from sqlalchemy.exc import OperationalError

from app.extensions import db
from app.models import Attachment, Paper
from app.services.files import recover_storage
from app.services.pdf_metadata import extract_metadata


def pdf_bytes(metadata=True, text=True, encrypted=False):
    writer = PdfWriter()
    page = writer.add_blank_page(width=600, height=800)
    if metadata:
        writer.add_metadata({"/Title": "Attention and Knowledge", "/Author": "Alice; Bob"})
    if text:
        font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
        page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): writer._add_object(font)})})
        stream = DecodedStreamObject()
        stream.set_data(b'BT /F1 14 Tf 40 750 Td (Attention and Knowledge) Tj 0 -30 Td (Authors: Alice; Bob) Tj 0 -30 Td (Published 2024 doi:10.1000/EXAMPLE) Tj 0 -30 Td (Abstract) Tj 0 -30 Td (We study knowledge and attention.) Tj 0 -30 Td (Keywords: knowledge) Tj ET')
        page[NameObject('/Contents')] = writer._add_object(stream)
    if encrypted:
        writer.encrypt('secret')
    result = BytesIO(); writer.write(result)
    return result.getvalue()


def upload(client, path='/api/papers', body=None, data=None, name='论文.pdf', mime='application/pdf', method='post'):
    form = {'file': (BytesIO(data if data is not None else pdf_bytes()), name, mime)}
    if body is not None:
        form['data'] = json.dumps(body)
    return getattr(client, method)(path, data=form)


def stored_files(app):
    root = Path(app.config['UPLOAD_FOLDER'])
    return [path for path in root.rglob('*') if path.is_file()]


def test_title_only_and_empty_authors_are_valid(client):
    result = client.post('/api/papers', json={'title': 'Only a title'})
    assert result.status_code == 201
    paper = result.json['data']
    assert paper['authors'] == '' and paper['paper_file'] is None and paper['note_attachments'] == []
    assert client.patch(f"/api/papers/{paper['id']}", json={'authors': '  '}).status_code == 200


def test_parse_is_stateless_and_extracts_all_fields(client, app):
    result = upload(client, '/api/papers/parse-pdf')
    assert result.status_code == 200
    parsed = result.json['data']
    assert parsed['missing'] == []
    assert parsed['fields'] == {'title': 'Attention and Knowledge', 'authors': 'Alice; Bob', 'year': 2024,
                                'doi': '10.1000/example', 'abstract': 'We study knowledge and attention.'}
    assert client.get('/api/papers').json['data']['total'] == 0
    assert stored_files(app) == []


def test_text_fallback_without_metadata():
    fields = extract_metadata(pdf_bytes(metadata=False))['fields']
    assert fields['title'] == 'Attention and Knowledge'
    assert fields['authors'] == 'Alice; Bob'


@pytest.mark.parametrize('data', [pdf_bytes(metadata=False, text=False), pdf_bytes(encrypted=True), b'%PDF-broken'])
def test_unrecognized_pdf_can_still_be_saved(client, data):
    result = upload(client, '/api/papers/parse-pdf', data=data)
    assert result.status_code == 200 and result.json['data']['missing']
    result = upload(client, body={'title': 'Manually supplied'}, data=data)
    assert result.status_code == 201


def test_paper_lifecycle_replaces_downloads_and_cascades(client, app):
    result = upload(client, body={'title': 'Original', 'year': 2024})
    assert result.status_code == 201, result.json
    paper = result.json['data']; pid = paper['id']; old = paper['paper_file']
    assert 'path' not in old
    with app.app_context():
        assert not Path(db.session.get(Attachment, old['id']).path).is_absolute()
    response = client.get(f"/api/files/{old['id']}")
    assert response.data == pdf_bytes() and response.mimetype == 'application/pdf'
    assert response.headers['Content-Disposition'].startswith('inline;')
    response.close()
    response = client.get(f"/api/files/{old['id']}?download=1")
    assert response.headers['Content-Disposition'].startswith('attachment;')
    response.close()
    result = upload(client, f'/api/papers/{pid}', body={'title': 'Updated'}, name='new.pdf', method='patch')
    assert result.status_code == 200 and result.json['data']['paper_file']['filename'] == 'new.pdf'
    assert len(stored_files(app)) == 1
    client.post(f'/api/papers/{pid}/notes', json={'content': 'online'})
    for name in ('notes.md', 'notes.txt'):
        assert upload(client, f'/api/papers/{pid}/note-attachments', data=b'# My notes', name=name, mime='text/plain').status_code == 201
    assert len(stored_files(app)) == 3
    assert client.delete(f'/api/papers/{pid}').status_code == 204
    assert stored_files(app) == []
    with app.app_context():
        assert db.session.scalar(db.select(db.func.count(Attachment.id))) == 0
    assert client.get('/api/dashboard').json['data']['total'] == 0


def test_delete_one_attachment_keeps_other_files_and_notes(client, app, make_paper):
    paper = make_paper()
    path = f"/api/papers/{paper['id']}/note-attachments"
    first = upload(client, path).json['data']
    second = upload(client, path).json['data']
    assert first['paper_id'] == second['paper_id'] == paper['id']
    assert client.delete(f"/api/files/{first['id']}").status_code == 204
    assert client.get(f"/api/files/{first['id']}").status_code == 404
    assert len(client.get(f"/api/papers/{paper['id']}").json['data']['note_attachments']) == 1
    assert len(stored_files(app)) == 1


@pytest.mark.parametrize('name,mime,data', [
    ('bad.exe', 'application/pdf', b'%PDF-1.7'), ('bad.pdf', 'text/plain', b'%PDF-1.7'),
    ('fake.pdf', 'application/pdf', b'hello'), ('empty.pdf', 'application/pdf', b''),
    ('fake.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', b'PKfake'),
    ('bad.txt', 'text/plain', b'\xff\x00'), ('bad.md', 'text/html', b'<html>'),
])
def test_invalid_files_rejected(client, make_paper, app, name, mime, data):
    pid = make_paper()['id']
    result = upload(client, f'/api/papers/{pid}/note-attachments', name=name, mime=mime, data=data)
    assert result.status_code == 400
    assert stored_files(app) == []


def test_size_limit_and_missing_parent(client, app):
    assert upload(client, '/api/papers/999/note-attachments').status_code == 404
    app.config['MAX_FILE_SIZE'] = 8
    assert upload(client, body={'title': 'too big'}).status_code == 413
    assert client.get('/api/papers').json['data']['total'] == 0


def test_missing_file_reported_but_record_can_be_removed(client, app):
    paper = upload(client, body={'title': 'Missing file'}).json['data']
    for path in stored_files(app): path.unlink()
    result = client.get(f"/api/files/{paper['paper_file']['id']}")
    assert result.status_code == 404 and result.json['error']['code'] == 'FILE_NOT_FOUND'
    assert client.delete(f"/api/papers/{paper['id']}").status_code == 204


def test_duplicate_upload_does_not_leak_files(client, app):
    upload(client, body={'title': 'Same', 'doi': '10.1000/same'})
    for body in ({'title': 'Same'}, {'title': 'Different', 'doi': '10.1000/same'}):
        assert upload(client, body=body).status_code == 409
    assert len(stored_files(app)) == 1


@pytest.mark.parametrize('operation', ['create', 'replace', 'delete_file', 'delete_paper'])
def test_database_failure_restores_files(client, app, monkeypatch, operation):
    original = upload(client, body={'title': 'Original'}).json['data']
    paths = {p: p.read_bytes() for p in stored_files(app)}
    def fail(): raise OperationalError('commit', {}, Exception('simulated failure'))
    with monkeypatch.context() as patch:
        patch.setattr(db.session, 'commit', fail)
        if operation == 'create': result = upload(client, body={'title': 'New'})
        elif operation == 'replace': result = upload(client, f"/api/papers/{original['id']}", body={'title': 'New'}, method='patch')
        elif operation == 'delete_file': result = client.delete(f"/api/files/{original['paper_file']['id']}")
        else: result = client.delete(f"/api/papers/{original['id']}")
        assert result.status_code == 500 and result.json['error']['code'] == 'DATABASE_ERROR'
    assert {p: p.read_bytes() for p in stored_files(app)} == paths
    assert client.get(f"/api/papers/{original['id']}").json['data'] == original


def test_file_move_failure_preserves_database(client, app, monkeypatch):
    paper = upload(client, body={'title': 'Locked'}).json['data']
    def fail(*args): raise PermissionError('locked')
    with monkeypatch.context() as patch:
        patch.setattr(Path, 'replace', fail)
        result = client.delete(f"/api/papers/{paper['id']}")
        assert result.status_code == 500 and result.json['error']['code'] == 'FILE_ERROR'
    assert client.get(f"/api/papers/{paper['id']}").json['data'] == paper
    assert len(stored_files(app)) == 1


def test_storage_recovery_restores_referenced_and_removes_orphans(client, app):
    upload(client, body={'title': 'Interrupted'})
    original = stored_files(app)[0]
    trash = original.parent / '.trash'; trash.mkdir()
    original.replace(trash / original.name)
    (original.parent / ('f' * 32 + '.pdf')).write_bytes(b'orphan')
    (trash / ('e' * 32 + '.pdf')).write_bytes(b'deleted')
    with app.app_context(): recover_storage()
    assert stored_files(app) == [original]


def test_docx_and_plain_text_headers(client, make_paper):
    pid = make_paper()['id']
    data = BytesIO()
    with ZipFile(data, 'w') as archive:
        archive.writestr('[Content_Types].xml', '<Types/>'); archive.writestr('word/document.xml', '<document/>')
    for name, mime, content in [('report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', data.getvalue()),
                                ('notes.md', 'application/octet-stream', b'<script>alert(1)</script>')]:
        result = upload(client, f'/api/papers/{pid}/note-attachments', name=name, mime=mime, data=content)
        assert result.status_code == 201
        response = client.get(f"/api/files/{result.json['data']['id']}")
        assert response.headers['X-Content-Type-Options'] == 'nosniff'
        assert response.data == content
        if name.endswith('.md'): assert response.mimetype == 'text/plain'
        else: assert response.headers['Content-Disposition'].startswith('attachment;')
        response.close()


def test_old_database_upgrade_preserves_related_data(app, client, make_paper):
    from app.migrations import upgrade_database
    from sqlalchemy.schema import CreateTable
    tag = client.post('/api/tags', json={'name': 'Preserved'}).json['data']
    paper = make_paper(tag_ids=[tag['id']])
    client.post(f"/api/papers/{paper['id']}/notes", json={'content': 'Keep me'})
    with app.app_context():
        db.session.remove()
        with db.engine.connect() as connection:
            connection.exec_driver_sql('PRAGMA foreign_keys=OFF'); connection.commit()
            ddl = str(CreateTable(Paper.__table__).compile(db.engine)).replace('CREATE TABLE papers', 'CREATE TABLE papers_old', 1)
            ddl = ddl.replace('PRIMARY KEY (id)', "CONSTRAINT ck_paper_authors CHECK (length(trim(authors)) > 0), PRIMARY KEY (id)")
            connection.exec_driver_sql(ddl)
            connection.exec_driver_sql('INSERT INTO papers_old SELECT * FROM papers')
            connection.exec_driver_sql('DROP TABLE papers')
            connection.exec_driver_sql('ALTER TABLE papers_old RENAME TO papers')
            connection.commit(); connection.exec_driver_sql('PRAGMA foreign_keys=ON'); connection.commit()
        upgrade_database(); upgrade_database()
        assert db.session.execute(db.text('PRAGMA foreign_key_check')).all() == []
    result = client.get(f"/api/papers/{paper['id']}").json['data']
    assert result['tags'][0]['id'] == tag['id'] and result['notes'][0]['content'] == 'Keep me'
    assert client.patch(f"/api/papers/{paper['id']}", json={'authors': ''}).status_code == 200
    assert client.delete(f"/api/papers/{paper['id']}").status_code == 204
