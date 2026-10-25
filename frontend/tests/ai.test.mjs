import assert from 'node:assert/strict';
import { test, afterEach, mock } from 'node:test';
import { api, ApiError } from '../src/api/client.ts';

afterEach(() => mock.restoreAll());

test('网页设置读取、测试与保存接口分开，写入使用防跨站请求头', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ data: { has_api_key: true } })));
  const body = { enabled: true, base_url: 'https://example.invalid/v1', model: 'test', api_key: '', timeout_seconds: 45, max_output_tokens: 3000, token_parameter: 'max_tokens' };
  await api.ai.settings();
  await api.ai.testSettings(body);
  await api.ai.saveSettings(body);
  assert.deepEqual(fetch.mock.calls.map(call => [call.arguments[0], call.arguments[1].method]), [
    ['/api/ai/settings', 'GET'], ['/api/ai/settings/test', 'POST'], ['/api/ai/settings', 'PUT'],
  ]);
  for (const call of fetch.mock.calls.slice(1)) {
    assert.equal(call.arguments[1].headers['X-PaperFlow-Settings'], '1');
    assert.equal(JSON.parse(call.arguments[1].body).api_key, '');
  }
});

test('AI 生成使用独立超时且不提交论文或笔记修改', async () => {
  const timeout = mock.method(AbortSignal, 'timeout', () => new AbortController().signal);
  const fetch = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ data: { markdown: '## 结果' } })));
  for (const action of ['analysis', 'keywords', 'reading-summary']) {
    await api.ai.generate(42, action);
  }
  assert.deepEqual(timeout.mock.calls.map(call => call.arguments[0]), [90000, 90000, 90000]);
  assert.deepEqual(fetch.mock.calls.map(call => call.arguments[0]), ['/api/papers/42/ai/analysis', '/api/papers/42/ai/keywords', '/api/papers/42/ai/reading-summary']);
  assert.ok(fetch.mock.calls.every(call => call.arguments[1].method === 'POST' && call.arguments[1].body === undefined));
});

test('确认添加只发送用户勾选关键词', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ data: { id: 42, tags: [] } })));
  await api.ai.applyKeywords(42, ['关键词一']);
  assert.equal(fetch.mock.calls[0].arguments[0], '/api/papers/42/ai/keywords/apply');
  assert.deepEqual(JSON.parse(fetch.mock.calls[0].arguments[1].body), { keywords: ['关键词一'] });
});

test('AI 未配置保留可操作提示和错误码', async () => {
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { code: 'AI_NOT_CONFIGURED', message: '请配置 AI' } }), { status: 503 }));
  await assert.rejects(api.ai.generate(1, 'analysis'), error => error instanceof ApiError && error.code === 'AI_NOT_CONFIGURED' && error.message === '请配置 AI');
});

test('离开文献页可取消未完成的 AI 请求', async () => {
  const controller = new AbortController(); controller.abort();
  mock.method(globalThis, 'fetch', async (_url, options) => options.signal.throwIfAborted());
  await assert.rejects(api.ai.generate(1, 'analysis', controller.signal), error => error.name === 'AbortError');
});
