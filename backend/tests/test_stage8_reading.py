import pytest
import json
from test_stage6_files import upload
from test_stage6_reading import record


def test_recent_reading_excludes_open_only_and_orders_read_events(client):
    papers = [upload(client, body={"title": f"Recent {i}"}).json["data"] for i in range(6)]
    record(client, papers[0]["paper_file"]["id"], read=False)
    for paper in papers[1:]:
        record(client, paper["paper_file"]["id"], read=True)
    recent = client.get('/api/dashboard').json['data']['recent_papers']
    assert [p['id'] for p in recent] == [p['id'] for p in reversed(papers[2:])]
    assert all(p['reading_progress']['last_read_at'] for p in recent)


def test_explain_only_supplies_selected_text_and_never_writes(app, client, monkeypatch):
    paper = upload(client, body={"title": "Excerpt", "abstract": "Do not include this"}).json["data"]
    app.config.update(AI_ENABLED=True, AI_API_KEY='test', AI_MODEL='test')
    calls = []
    service = app.extensions['ai_service']
    monkeypatch.setattr(service, '_complete', lambda instruction, context: calls.append(context) or '## 解释\n\n公式 $x^2$')
    before = client.get(f"/api/papers/{paper['id']}").json
    response = client.post(f"/api/papers/{paper['id']}/ai/explain", json={"file_id": paper['paper_file']['id'], "page": 1, "text": "selected excerpt"})
    assert response.status_code == 200
    assert calls == [{"title": "Excerpt", "selected_text": "selected excerpt", "page": 1}]
    assert client.get(f"/api/papers/{paper['id']}").json == before


@pytest.mark.parametrize('patch', [{'page': True}, {'page': 0}, {'text': ''}, {'text': 'x' * 8001}, {'file_id': 2**70}, {'file_id': False}, {'unexpected': 1}])
def test_invalid_excerpt_rejected_before_service(client, patch):
    paper = upload(client, body={"title": "Validation"}).json['data']
    response = client.post(f"/api/papers/{paper['id']}/ai/explain", json={"file_id": paper['paper_file']['id'], "page": 1, "text": 'excerpt', **patch})
    assert response.status_code == 400


def test_wrong_attachment_and_out_of_range_excerpt_rejected(client):
    first = upload(client, body={"title": "First"}).json['data']
    second = upload(client, body={"title": "Second"}).json['data']
    path = f"/api/papers/{first['id']}/ai/explain"
    assert client.post(path, json={"file_id": second['paper_file']['id'], "page": 1, "text": 'excerpt'}).status_code == 400
    record(client, first['paper_file']['id'], total=1)
    assert client.post(path, json={"file_id": first['paper_file']['id'], "page": 2, "text": 'excerpt'}).status_code == 400
    disabled = client.post(path, json={"file_id": first['paper_file']['id'], "page": 1, "text": 'excerpt'})
    assert disabled.status_code == 503
    assert disabled.json['error']['code'] == 'AI_DISABLED'


def test_structured_and_legacy_notes_keep_existing_crud_contract(client):
    paper = upload(client, body={'title': 'Notes compatibility'}).json['data']
    path = f"/api/papers/{paper['id']}/notes"
    legacy = '## 旧笔记\n\n我的公式 $E=mc^2$'
    old_note = client.post(path, json={'content': legacy}).json['data']
    fields = {'version': 1, 'chapter': '3.3', 'excerpt': 'A quote', 'understanding': '理解 $x^2$', 'tags': ['RL']}
    source = {'fileId': paper['paper_file']['id'], 'page': 1, 'kind': 'excerpt'}
    content = f'<!-- paperflow-source:{json.dumps(source)} -->\n<!-- paperflow-reading:{json.dumps(fields)} -->\n## 我的理解\n\n理解 $x^2$'
    response = client.post(path, json={'content': content})
    assert response.status_code == 201
    note = response.json['data']
    assert note['content'] == content
    updated = content.replace('理解 $x^2$', '补充理解 $x^3$')
    assert client.patch(f"/api/notes/{note['id']}", json={'content': updated}).json['data']['content'] == updated
    records = {n['id']: n for n in client.get(path).json['data']}
    assert records[old_note['id']]['content'] == legacy
    assert records[note['id']]['content'] == updated
    assert client.delete(f"/api/notes/{note['id']}").status_code == 204
    assert [n['id'] for n in client.get(path).json['data']] == [old_note['id']]


def test_ai_reading_summary_uses_readable_note_body_without_metadata(app, client, monkeypatch):
    from app.services.ai_context import build_context
    from app.models import Paper
    from app.extensions import db
    paper = upload(client, body={'title': 'Readable notes', 'abstract': 'Summary context'}).json['data']
    source = json.dumps({'fileId': paper['paper_file']['id'], 'page': 1, 'kind': 'excerpt'})
    metadata = json.dumps({'version': 1, 'understanding': 'metadata repeated ' * 800})
    body = '## 原文摘录\n\n> Quote\n\n## 我的理解\n\nMy own interpretation $x^2$'
    client.post(f"/api/papers/{paper['id']}/notes", json={'content': f'<!-- paperflow-source:{source} -->\n<!-- paperflow-reading:{metadata} -->\n{body}'})
    monkeypatch.setattr('app.services.ai_context.parse_pdf_safely', lambda *args, **kwargs: {'text': '', 'pages': [], 'total_pages': 1, 'truncated': False})
    with app.app_context():
        context, _ = build_context(db.session.get(Paper, paper['id']), include_notes=True)
        assert context['user_notes'][0]['content'] == body
