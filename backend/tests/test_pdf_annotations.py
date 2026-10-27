import pytest
from app.extensions import db
from app.models import PdfAnnotation
from app.migrations import upgrade_database
from test_stage6_files import upload


def sample(kind='pen'):
    geometry = {'points': [[.1, .2], [.4, .2]]} if kind == 'pen' else {'rects': [{'x': .1, 'y': .2, 'width': .4, 'height': .03}]} if kind == 'highlight' else {'x': .8, 'y': .2}
    return dict(page=1, kind=kind, color='#cf654f', geometry=geometry, text='旁注' if kind == 'text' else '')


@pytest.mark.parametrize('kind', ['pen', 'highlight', 'text'])
def test_annotation_roundtrip_update_and_delete(client, kind):
    paper = upload(client, body={'title': 'Annotation test'}).json['data']
    url = f"/api/files/{paper['paper_file']['id']}/annotations"
    response = client.post(url, json=sample(kind))
    assert response.status_code == 201
    mark = response.json['data']
    assert client.get(url).json['data'] == [mark]
    updated = {**sample(kind), 'color': '#527eb0', 'text': '已编辑'}
    assert client.put(f"{url}/{mark['id']}", json=updated).json['data'] == {**updated, 'id': mark['id']}
    assert client.delete(f"{url}/{mark['id']}").status_code == 204
    assert client.get(url).json['data'] == []


@pytest.mark.parametrize('patch', [{'page': True}, {'page': 0}, {'kind': 'script'}, {'color': 'url(x)'}, {'geometry': {'points': [[.1, .2], [2, 0]]}}, {'geometry': {'points': [[False, 0], [.1, .2]]}}, {'geometry': {'points': [[0, 0]]}}, {'text': 'x' * 2001}, {'kind': 'text', 'text': '', 'geometry': {'x': .2, 'y': .3}}, {'kind': 'highlight', 'geometry': {'rects': [{'x': .9, 'y': 0, 'width': .2, 'height': .1}]}}])
def test_invalid_mark_never_saved(client, patch):
    paper = upload(client, body={'title': 'Annotation test'}).json['data']
    url = f"/api/files/{paper['paper_file']['id']}/annotations"
    assert client.post(url, json={**sample(), **patch}).status_code == 400
    assert client.get(url).json['data'] == []


def test_marks_scoped_to_file_and_cascade_with_pdf(app, client):
    a = upload(client, body={'title': 'A'}).json['data']
    b = upload(client, body={'title': 'B'}).json['data']
    path = f"/api/files/{a['paper_file']['id']}/annotations"
    mark = client.post(path, json=sample()).json['data']
    other = f"/api/files/{b['paper_file']['id']}/annotations"
    assert client.get(other).json['data'] == []
    assert client.delete(f"{other}/{mark['id']}").status_code == 404
    assert client.put(f"{other}/{mark['id']}", json=sample()).status_code == 404
    assert client.delete(f"/api/files/{a['paper_file']['id']}").status_code == 204
    with app.app_context():
        assert db.session.get(PdfAnnotation, mark['id']) is None


def test_old_database_upgrade_preserves_paper_and_notes(app, client):
    paper = upload(client, body={'title': 'Annotation test'}).json['data']
    note = client.post(f"/api/papers/{paper['id']}/notes", json={'content': '旧笔记 $x^2$'}).json['data']
    with app.app_context():
        PdfAnnotation.__table__.drop(db.engine)
        upgrade_database()
        upgrade_database()
    assert client.get(f"/api/papers/{paper['id']}").status_code == 200
    assert client.get(f"/api/papers/{paper['id']}/notes").json['data'] == [note]
    url = f"/api/files/{paper['paper_file']['id']}/annotations"
    assert client.post(url, json=sample('text')).status_code == 201


def test_text_box_geometry_and_font_size_persist_without_rewriting_legacy(client):
    paper = upload(client, body={'title': 'Resizable text'}).json['data']
    url = f"/api/files/{paper['paper_file']['id']}/annotations"
    legacy = client.post(url, json=sample('text')).json['data']
    assert legacy['geometry'] == {'x': .8, 'y': .2}
    geometry = {'x': .1, 'y': .3, 'width': .4, 'height': .2, 'fontSize': .025}
    updated = client.put(f"{url}/{legacy['id']}", json={**sample('text'), 'geometry': geometry})
    assert updated.status_code == 200
    assert updated.json['data']['geometry'] == geometry
    assert client.get(url).json['data'][0]['geometry'] == geometry


@pytest.mark.parametrize('geometry', [
    {'x': .9, 'y': .1, 'width': .3}, {'x': .1, 'y': .9, 'height': .2},
    {'x': .1, 'y': .1, 'width': 0}, {'x': .1, 'y': .1, 'height': -1},
    {'x': .1, 'y': .1, 'width': True}, {'x': .1, 'y': .1, 'fontSize': True},
    {'x': .1, 'y': .1, 'fontSize': .001}, {'x': .1, 'y': .1, 'fontSize': .5},
])
def test_text_box_rejects_invalid_dimensions_without_mutation(client, geometry):
    paper = upload(client, body={'title': 'Bounds'}).json['data']
    url = f"/api/files/{paper['paper_file']['id']}/annotations"
    assert client.post(url, json={**sample('text'), 'geometry': geometry}).status_code == 400
    assert client.get(url).json['data'] == []
