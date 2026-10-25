import pytest
from app.extensions import db
from app.migrations import upgrade_database
from app.models import ReadingProgress
from test_stage6_files import upload


def setup_paper(client):
    return upload(client, body={'title': '阅读进度测试'}).json['data']


def record(client, file_id, page=1, total=10, read=False):
    return client.put(f'/api/files/{file_id}/reading-progress', json={
        'total_pages': total, 'current_page': page, 'read': read})


def test_open_does_not_read_and_progress_restores(client):
    paper = setup_paper(client); fid = paper['paper_file']['id']
    initial = record(client, fid).json['data']
    assert initial == dict(total_pages=10, current_page=1, max_page=0, percent=0, last_read_at=None)
    assert client.get(f"/api/papers/{paper['id']}").json['data']['reading_status'] == 'not_started'
    saved = record(client, fid, page=4, read=True).json['data']
    assert saved['percent'] == 40 and saved['last_read_at'].endswith('Z')
    back = record(client, fid, page=2, read=True).json['data']
    assert back['max_page'] == 4 and back['current_page'] == 2 and back['percent'] == 40
    reopened = record(client, fid, page=2).json['data']
    assert reopened == back  # 恢复不会覆盖最近阅读时间或历史进度。
    detail = client.get(f"/api/papers/{paper['id']}").json['data']
    assert detail['reading_status'] == 'reading'
    assert detail['paper_file']['reading_progress'] == back
    assert client.get('/api/papers').json['data']['items'][0]['reading_progress'] == back
    assert client.get('/api/dashboard').json['data']['reading'] == 1


def test_completion_is_sticky_and_replacement_has_own_progress(client, app):
    paper = setup_paper(client); pid = paper['id']; fid = paper['paper_file']['id']
    assert record(client, fid, page=10, read=True).json['data']['percent'] == 100
    assert record(client, fid, page=1, read=True).json['data']['percent'] == 100
    result = client.patch(f'/api/papers/{pid}', json={'reading_status': 'not_started'}).json['data']
    assert result['reading_status'] == 'completed'
    replaced = upload(client, f'/api/papers/{pid}', body={'title': paper['title']}, method='patch').json['data']
    assert replaced['paper_file']['id'] != fid and replaced['reading_progress'] is None
    assert record(client, fid).status_code == 404
    assert record(client, replaced['paper_file']['id']).json['data']['percent'] == 0
    assert client.get(f'/api/papers/{pid}').json['data']['reading_status'] == 'completed'
    with app.app_context():
        assert db.session.get(ReadingProgress, fid) is None
    assert client.delete(f'/api/papers/{pid}').status_code == 204
    with app.app_context():
        assert db.session.query(ReadingProgress).count() == 0


def test_single_page_requires_read_action(client):
    paper = setup_paper(client); fid = paper['paper_file']['id']
    assert record(client, fid, total=1).json['data']['percent'] == 0
    assert record(client, fid, total=1, read=True).json['data']['percent'] == 100


def test_replacing_unfinished_pdf_resets_status_immediately(client):
    paper = setup_paper(client); pid = paper['id']
    record(client, paper['paper_file']['id'], page=4, read=True)
    replaced = upload(client, f'/api/papers/{pid}', body={'title': paper['title']}, method='patch').json['data']
    assert replaced['reading_progress'] is None
    assert replaced['reading_status'] == 'not_started'


def test_large_document_nonzero_progress_never_rounds_to_zero_or_100(client):
    paper = setup_paper(client); fid = paper['paper_file']['id']
    assert record(client, fid, total=1000, read=True).json['data']['percent'] == 1
    assert record(client, fid, total=1000, page=999, read=True).json['data']['percent'] == 99


@pytest.mark.parametrize('values', [
    {'current_page': 0}, {'current_page': 11}, {'current_page': True}, {'current_page': 1.5},
    {'total_pages': 0}, {'total_pages': '10'}, {'total_pages': 100001}, {'read': 1}, {'extra': 'bad'},
])
def test_invalid_progress_does_not_write(client, app, values):
    paper = setup_paper(client); fid = paper['paper_file']['id']
    data = {'total_pages': 10, 'current_page': 1, 'read': False, **values}
    assert client.put(f'/api/files/{fid}/reading-progress', json=data).status_code == 400
    with app.app_context():
        assert db.session.get(ReadingProgress, fid) is None


def test_page_count_mismatch_and_note_pdf_rejected(client):
    paper = setup_paper(client); fid = paper['paper_file']['id']
    record(client, fid, page=3, read=True)
    assert record(client, fid, total=8).status_code == 409
    assert client.get(f"/api/papers/{paper['id']}").json['data']['reading_progress']['current_page'] == 3
    note = upload(client, f"/api/papers/{paper['id']}/note-attachments").json['data']
    assert record(client, note['id']).status_code == 400


def test_upgrade_is_idempotent_and_preserves_progress(client, app):
    paper = setup_paper(client); fid = paper['paper_file']['id']
    saved = record(client, fid, page=5, read=True).json['data']
    with app.app_context():
        upgrade_database(); upgrade_database()
    assert client.get(f"/api/papers/{paper['id']}").json['data']['reading_progress'] == saved
