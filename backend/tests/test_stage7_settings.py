import json
from pathlib import Path

import pytest

from app import create_app
from app.services import ai_settings
from test_stage7_ai import upstream  # noqa: F401 — 使用隔离的模型 HTTP 适配器

HEADERS = {'X-PaperFlow-Settings': '1', 'Origin': 'http://localhost:5173'}
PAYLOAD = {'enabled': True, 'base_url': 'https://example.invalid/v1', 'model': 'test-model',
           'api_key': 'settings-test-secret', 'timeout_seconds': 30, 'max_output_tokens': 3000,
           'token_parameter': 'max_tokens'}


@pytest.fixture(autouse=True)
def empty_initial_config(app):
    app.config.update(AI_ENABLED=False, AI_API_KEY='', AI_MODEL='')


def put(client, body):
    return client.put('/api/ai/settings', json=body, headers=HEADERS)


def test_save_live_and_restart_without_secret_readback(app, client, make_paper, upstream):
    assert client.get('/api/ai/settings').json['data']['has_api_key'] is False
    result = put(client, PAYLOAD)
    assert result.status_code == 200, result.json
    assert result.json['data']['has_api_key'] is True
    assert result.json['data']['source'] == 'saved'
    assert 'settings-test-secret' not in result.get_data(as_text=True)
    read = client.get('/api/ai/settings')
    assert 'api_key' not in read.json['data']
    assert read.headers['Cache-Control'] == 'no-store'
    assert client.get('/api/ai/status').json['data']['available'] is True
    paper = make_paper(abstract='仅测试论文')
    assert client.post(f"/api/papers/{paper['id']}/ai/analysis").status_code == 200
    request, timeout = upstream[1][0]
    assert request.get_header('Authorization') == 'Bearer settings-test-secret'
    assert timeout == 30 and json.loads(request.data)['max_tokens'] == 3000
    other = create_app({'TESTING': True, 'AI_SETTINGS_PATH': app.config['AI_SETTINGS_PATH']})
    assert other.test_client().get('/api/ai/settings').json == read.json
    assert other.test_client().get('/api/ai/status').json['data']['available'] is True


def test_blank_preserves_key_clear_disables_and_does_not_fall_back(app, client):
    put(client, PAYLOAD)
    assert put(client, {'model': 'another-model', 'api_key': ''}).status_code == 200
    assert app.extensions['ai_service'].settings()[0] == PAYLOAD['api_key']
    app.config['AI_API_KEY'] = 'environment-key'
    result = put(client, {'enabled': False, 'clear_api_key': True})
    assert result.status_code == 200 and result.json['data']['has_api_key'] is False
    assert app.extensions['ai_settings'].effective()['AI_API_KEY'] == ''
    assert client.get('/api/ai/status').json['data']['available'] is False


def test_test_uses_unsaved_form_without_persisting_or_paper_data(app, client, upstream):
    result = client.post('/api/ai/settings/test', json=PAYLOAD, headers=HEADERS)
    assert result.status_code == 200, result.json
    assert not Path(app.config['AI_SETTINGS_PATH']).exists()
    assert client.get('/api/ai/status').json['data']['available'] is False
    body = json.loads(upstream[1][0][0].data)
    assert json.loads(body['messages'][1]['content']) == {'message': '连接测试，不含论文或笔记。'}
    assert 'settings-test-secret' not in result.get_data(as_text=True)


def test_failed_test_does_not_change_saved_config(app, client, upstream):
    put(client, PAYLOAD)
    before = Path(app.config['AI_SETTINGS_PATH']).read_bytes()
    upstream[0]['error'] = TimeoutError()
    result = client.post('/api/ai/settings/test', json={**PAYLOAD, 'model': 'other'}, headers=HEADERS)
    assert result.status_code == 504
    assert Path(app.config['AI_SETTINGS_PATH']).read_bytes() == before


def test_changed_destination_never_uses_old_secret(client, upstream):
    put(client, PAYLOAD)
    for path in ['/api/ai/settings', '/api/ai/settings/test']:
        method = client.put if path.endswith('settings') else client.post
        response = method(path, json={'base_url': 'https://another.invalid/v1'}, headers=HEADERS)
        assert response.status_code == 400
    assert upstream[1] == []
    assert put(client, {'base_url': 'https://another.invalid/v1', 'api_key': 'new-test-key'}).status_code == 200


@pytest.mark.parametrize('change', [
    {'base_url': 'javascript:alert(1)'}, {'base_url': 'https://user:key@example.invalid'},
    {'base_url': 'https://example.invalid/v1/chat/completions'}, {'base_url': 'http://example.invalid'},
    {'timeout_seconds': 61}, {'timeout_seconds': True}, {'max_output_tokens': 0},
    {'enabled': 'yes'}, {'token_parameter': 'bad'}, {'api_key': 'bad\nkey'},
    {'clear_api_key': True, 'api_key': 'new-key'}, {'unexpected': 'value'},
], ids=['bad-url', 'userinfo', 'full-endpoint', 'insecure-remote', 'timeout', 'bool-number',
        'tokens', 'enabled', 'parameter', 'key-control', 'clear-and-set', 'unknown-field'])
def test_invalid_values_never_replace_saved_config(app, client, change):
    put(client, PAYLOAD)
    before = Path(app.config['AI_SETTINGS_PATH']).read_bytes()
    assert put(client, change).status_code == 400
    assert Path(app.config['AI_SETTINGS_PATH']).read_bytes() == before


def test_enable_requires_model_and_key(client):
    response = put(client, {'enabled': True})
    assert response.status_code == 503 and response.json['error']['code'] == 'AI_NOT_CONFIGURED'
    assert client.get('/api/ai/status').json['data']['available'] is False


def test_write_failure_preserves_existing_configuration(app, client, monkeypatch):
    put(client, PAYLOAD)
    before = Path(app.config['AI_SETTINGS_PATH']).read_bytes()
    def fail(*args):
        raise PermissionError('private path')
    monkeypatch.setattr(ai_settings.os, 'replace', fail)
    result = put(client, {'model': 'another'})
    assert result.status_code == 503 and 'private path' not in result.get_data(as_text=True)
    assert Path(app.config['AI_SETTINGS_PATH']).read_bytes() == before


def test_corrupt_settings_does_not_break_library(app, client, make_paper):
    Path(app.config['AI_SETTINGS_PATH']).write_text('broken-json', encoding='utf-8')
    assert client.get('/api/ai/status').json['data']['available'] is False
    make_paper()
    assert client.get('/api/papers').status_code == 200


def test_settings_rejects_cross_site_and_non_local_requests(client, upstream):
    assert client.put('/api/ai/settings', json=PAYLOAD).status_code == 403
    for path in ['/api/ai/settings', '/api/ai/settings/test']:
        method = client.put if path.endswith('settings') else client.post
        assert method(path, json=PAYLOAD, headers={**HEADERS, 'Origin': 'https://evil.invalid'}).status_code == 403
        assert method(path, json=PAYLOAD, headers={**HEADERS, 'Sec-Fetch-Site': 'cross-site'}).status_code == 403
        assert method(path, json=PAYLOAD, headers=HEADERS, environ_overrides={'REMOTE_ADDR': '192.0.2.1'}).status_code == 403
    assert upstream[1] == []


def test_environment_values_used_until_first_web_save(app, client):
    app.config.update(AI_API_KEY='env-secret', AI_MODEL='env-model', AI_ENABLED=True)
    assert client.get('/api/ai/settings').json['data']['source'] == 'environment'
    assert put(client, {'enabled': False}).status_code == 200
    app.config.update(AI_ENABLED=True, AI_MODEL='changed-env')
    assert client.get('/api/ai/settings').json['data']['model'] == 'env-model'
    assert client.get('/api/ai/status').json['data']['available'] is False
