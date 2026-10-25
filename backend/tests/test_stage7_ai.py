import json
import subprocess
from io import BytesIO
from urllib.error import HTTPError, URLError

import pytest
from pypdf import PdfReader, PdfWriter

from app.services import ai_service, pdf_metadata
from app.services.ai_service import SECTIONS
from test_stage6_files import pdf_bytes, upload


@pytest.fixture()
def enabled(app):
    app.config.update(AI_ENABLED=True, AI_API_KEY="test-secret-never-return", AI_MODEL="test-model",
                      AI_BASE_URL="https://example.invalid/v1")
    return app.extensions["ai_service"]


@pytest.fixture()
def upstream(monkeypatch):
    calls = []
    state = {"content": json.dumps({key: "依据原文 $x^2$" for key in SECTIONS}), "finish_reason": "stop"}

    class Response(BytesIO):
        pass

    class Opener:
        def open(self, request, timeout):
            calls.append((request, timeout))
            if "error" in state:
                raise state["error"]
            raw = state.get("raw", json.dumps({"choices": [{"message": {"content": state["content"]},
                                                           "finish_reason": state["finish_reason"]}]}).encode())
            return Response(raw)

    monkeypatch.setattr(ai_service, "build_opener", lambda *args: Opener())
    return state, calls


def test_disabled_and_bad_configuration_leave_crud_working(app, client, make_paper, upstream):
    paper = make_paper(abstract="原摘要")
    app.config.update(AI_ENABLED=False)
    assert client.get('/api/ai/status').json['data']['available'] is False
    for action in ('analysis', 'keywords', 'reading-summary'):
        result = client.post(f"/api/papers/{paper['id']}/ai/{action}")
        assert result.status_code == 503 and result.json['error']['code'] == 'AI_DISABLED'
    app.config.update(AI_ENABLED=True, AI_API_KEY='', AI_MODEL='')
    assert client.post(f"/api/papers/{paper['id']}/ai/analysis").json['error']['code'] == 'AI_NOT_CONFIGURED'
    app.config.update(AI_API_KEY='test', AI_MODEL='model', AI_TIMEOUT_SECONDS='bad')
    assert client.get('/api/ai/status').json['data']['available'] is False
    assert client.post(f"/api/papers/{paper['id']}/ai/analysis").json['error']['code'] == 'AI_CONFIG_ERROR'
    assert client.patch(f"/api/papers/{paper['id']}", json={'title': '正常编辑'}).status_code == 200
    assert client.post(f"/api/papers/{paper['id']}/notes", json={'content': '正常笔记'}).status_code == 201
    assert client.get('/api/dashboard').status_code == 200
    assert upstream[1] == []


def test_analysis_uses_pdf_and_does_not_write(enabled, client, upstream):
    paper = upload(client, body={'title': 'AI PDF', 'abstract': '原摘要'}).json['data']
    before = client.get(f"/api/papers/{paper['id']}").json
    result = client.post(f"/api/papers/{paper['id']}/ai/analysis")
    assert result.status_code == 200, result.json
    data = result.json['data']
    assert all('## ' + section in data['markdown'] for section in SECTIONS)
    assert data['source']['kind'] == 'pdf' and data['source']['pages'] == [1]
    request, timeout = upstream[1][0]
    assert request.full_url == 'https://example.invalid/v1/chat/completions'
    assert request.get_header('Authorization') == 'Bearer test-secret-never-return'
    payload = json.loads(request.data)
    assert payload['model'] == 'test-model' and payload['max_completion_tokens'] == 3000
    context = json.loads(payload['messages'][1]['content'])
    assert 'Attention and Knowledge' in context['paper_text']
    assert 'user_notes' not in context and timeout == 45
    assert client.get(f"/api/papers/{paper['id']}").json == before
    assert 'test-secret' not in result.get_data(as_text=True)


def test_reading_uses_fresh_notes_and_only_explicit_save_writes(enabled, client, make_paper, upstream):
    paper = make_paper(abstract='足够的论文摘要')
    pid = paper['id']
    old = client.post(f'/api/papers/{pid}/notes', json={'content': '旧笔记'}).json['data']
    client.patch(f"/api/notes/{old['id']}", json={'content': '我的关注点是实验复现'})
    upstream[0]['content'] = '# 我的阅读总结\n\n关注实验复现，公式 $x^2$。'
    result = client.post(f'/api/papers/{pid}/ai/reading-summary').json['data']
    assert result['source']['kind'] == 'abstract' and result['source']['notes_used'] == 1
    context = json.loads(json.loads(upstream[1][0][0].data)['messages'][1]['content'])
    assert context['user_notes'][0]['content'] == '我的关注点是实验复现'
    assert len(client.get(f'/api/papers/{pid}/notes').json['data']) == 1
    new = client.post(f'/api/papers/{pid}/notes', json={'content': result['markdown']})
    assert new.status_code == 201 and new.json['data']['id'] != old['id']
    notes = client.get(f'/api/papers/{pid}/notes').json['data']
    assert next(note for note in notes if note['id'] == old['id'])['content'] == '我的关注点是实验复现'
    assert client.get(f'/api/papers/{pid}').json['data']['abstract'] == '足够的论文摘要'


def test_keywords_require_explicit_subset_and_merge_idempotently(enabled, client, make_paper, upstream):
    tag = client.post('/api/tags', json={'name': '原标签'}).json['data']
    existing = client.post('/api/tags', json={'name': 'Attention'}).json['data']
    paper = make_paper(abstract='摘要', tag_ids=[tag['id']])
    pid = paper['id']
    upstream[0]['content'] = json.dumps({'keywords': ['attention', '新关键词', '不选的词']})
    generated = client.post(f'/api/papers/{pid}/ai/keywords')
    assert generated.status_code == 200
    assert client.get(f'/api/papers/{pid}').json['data']['tags'] == paper['tags']
    for _ in range(2):
        applied = client.post(f'/api/papers/{pid}/ai/keywords/apply', json={'keywords': ['attention', '新关键词']})
        assert applied.status_code == 200
        assert {tag['name'] for tag in applied.json['data']['tags']} == {'原标签', 'Attention', '新关键词'}
        assert existing['id'] in [tag['id'] for tag in applied.json['data']['tags']]
    assert len(client.get('/api/tags').json['data']) == 3


@pytest.mark.parametrize('words', [[], ['a'] * 9, 'bad', [None], [''], ['x' * 51], ['合法', False]])
def test_invalid_keyword_confirmation_is_atomic(client, make_paper, words):
    paper = make_paper()
    assert client.post(f"/api/papers/{paper['id']}/ai/keywords/apply", json={'keywords': words}).status_code == 400
    assert client.get('/api/tags').json['data'] == []


@pytest.mark.parametrize('error,code,status', [
    (TimeoutError(), 'AI_TIMEOUT', 504), (URLError(TimeoutError()), 'AI_TIMEOUT', 504),
    (URLError('secret host detail'), 'AI_CONNECTION_ERROR', 502),
    (HTTPError('https://secret', 401, 'secret', {}, None), 'AI_AUTH_ERROR', 502),
    (HTTPError('https://secret', 429, 'secret', {}, None), 'AI_RATE_LIMITED', 503),
    (HTTPError('https://secret', 500, 'secret', {}, None), 'AI_UPSTREAM_ERROR', 502),
])
def test_upstream_errors_are_safe(enabled, client, make_paper, upstream, error, code, status):
    paper = make_paper(abstract='摘要')
    upstream[0]['error'] = error
    result = client.post(f"/api/papers/{paper['id']}/ai/analysis")
    assert result.status_code == status and result.json['error']['code'] == code
    assert 'secret' not in result.get_data(as_text=True)
    assert client.get(f"/api/papers/{paper['id']}").json['data'] == paper


@pytest.mark.parametrize('raw', [b'bad', b'{}', b'null', b'{"choices": []}', b'x' * 262145],
                         ids=['invalid-json', 'empty-object', 'null', 'empty-choices', 'oversized'])
def test_malformed_response(enabled, client, make_paper, upstream, raw):
    paper = make_paper(abstract='摘要')
    upstream[0]['raw'] = raw
    assert client.post(f"/api/papers/{paper['id']}/ai/analysis").json['error']['code'] == 'AI_INVALID_RESPONSE'


@pytest.mark.parametrize('action,content', [('analysis', '{}'), ('analysis', 'not json'),
    ('keywords', '{"keywords": ["a", "Ａ", "b"]}'), ('keywords', '{"keywords": [1, 2, 3]}'),
    ('reading-summary', ''), ('reading-summary', 'x' * 40001)],
    ids=['missing-sections', 'not-json', 'duplicate-keywords', 'non-string-keywords', 'empty-text', 'oversized-text'])
def test_invalid_content(enabled, client, make_paper, upstream, action, content):
    paper = make_paper(abstract='摘要')
    upstream[0]['content'] = content
    assert client.post(f"/api/papers/{paper['id']}/ai/{action}").json['error']['code'] == 'AI_INVALID_RESPONSE'


def test_truncated_response_is_not_saved(enabled, client, make_paper, upstream):
    paper = make_paper(abstract='摘要')
    upstream[0]['finish_reason'] = 'length'
    assert client.post(f"/api/papers/{paper['id']}/ai/analysis").status_code == 502


def test_no_content_no_request_and_missing_paper(enabled, client, make_paper, upstream):
    paper = make_paper()
    assert client.post(f"/api/papers/{paper['id']}/ai/analysis").json['error']['code'] == 'AI_NO_CONTENT'
    assert client.post('/api/papers/99999/ai/analysis').status_code == 404
    assert client.post(f"/api/papers/{paper['id']}/ai/unknown").status_code == 404
    assert upstream[1] == []


def test_pdf_sampling_and_limits():
    writer = PdfWriter()
    page = PdfReader(BytesIO(pdf_bytes())).pages[0]
    for _ in range(60):
        writer.add_page(page)
    stream = BytesIO(); writer.write(stream)
    result = pdf_metadata.extract_paper_text(stream.getvalue())
    assert result['truncated'] is True and result['total_pages'] == 60
    assert len(result['pages']) == 24 and result['pages'][0] == 1 and result['pages'][-1] == 60
    assert len(result['text']) <= 24000


@pytest.mark.parametrize('data', [pdf_bytes(text=False), pdf_bytes(encrypted=True), b'%PDF-bad'])
def test_pdf_unreadable_falls_back_explicitly(enabled, client, upstream, data):
    paper = upload(client, body={'title': 'Bad PDF', 'abstract': '可用摘要'}, data=data).json['data']
    result = client.post(f"/api/papers/{paper['id']}/ai/analysis").json['data']
    assert result['source']['kind'] == 'abstract' and len(result['source']['warnings']) >= 2


def test_pdf_timeout_is_bounded(monkeypatch):
    def timeout(*args, **kwargs):
        assert kwargs['timeout'] == 12
        raise subprocess.TimeoutExpired('parse', 12)
    monkeypatch.setattr(pdf_metadata.subprocess, 'run', timeout)
    assert pdf_metadata.parse_pdf_safely(b'%PDF', full_text=True)['warning']


def test_long_notes_and_abstract_are_bounded(enabled, client, make_paper, upstream):
    paper = make_paper(abstract='摘' * 40000)
    for i in range(22):
        client.post(f"/api/papers/{paper['id']}/notes", json={'content': str(i) + '笔记' * 5000})
    upstream[0]['content'] = '# 我的阅读总结'
    result = client.post(f"/api/papers/{paper['id']}/ai/reading-summary").json['data']
    context = json.loads(json.loads(upstream[1][0][0].data)['messages'][1]['content'])
    assert len(context['paper']['abstract']) == 6000
    assert sum(len(note['content']) for note in context['user_notes']) <= 8000
    assert len(context['user_notes']) == 20
    assert context['user_notes'][0]['content'].startswith('21')
    assert result['source']['notes_used'] == 20 and len(result['source']['warnings']) == 3


def test_legacy_token_parameter(app, enabled, client, make_paper, upstream):
    app.config['AI_TOKEN_PARAMETER'] = 'max_tokens'
    paper = make_paper(abstract='摘要')
    assert client.post(f"/api/papers/{paper['id']}/ai/analysis").status_code == 200
    payload = json.loads(upstream[1][0][0].data)
    assert payload['max_tokens'] == 3000 and 'max_completion_tokens' not in payload
