import assert from 'node:assert/strict';
import { test, afterEach, mock } from 'node:test';
import { api, ApiError, errorMessage } from '../src/api/client.ts';

afterEach(() => mock.restoreAll());

test('删除接口的 204 空响应不尝试解析 JSON', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(null, { status: 204 }));
  assert.equal(await api.papers.delete(12), undefined);
  assert.equal(fetchMock.mock.calls[0].arguments[0], '/api/papers/12');
  assert.equal(fetchMock.mock.calls[0].arguments[1].method, 'DELETE');
  assert.equal(fetchMock.mock.calls[0].arguments[1].body, undefined);
});

test('保留重复文献的错误码和字段供表单定位', async () => {
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: {
    code: 'DUPLICATE_PAPER', message: '已存在相同DOI的文献', details: { field: 'doi' },
  } }), { status: 409 }));
  await assert.rejects(api.papers.update(1, { doi: '10.1000/test' }), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 409);
    assert.equal(error.details.field, 'doi');
    assert.equal(error.code, 'DUPLICATE_PAPER');
    assert.match(error.message, /DOI/);
    return true;
  });
});

test('写请求采用 JSON 且正确保留中文、换行、false 和 null', async () => {
  const payload = { title: '中文标题', abstract: '第一行\n第二行', is_favorite: false, year: null, tag_ids: [1, 2] };
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ data: { id: 1, ...payload } })));
  const result = await api.papers.update(1, payload);
  assert.equal(result.title, payload.title);
  const [, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(options.method, 'PATCH');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(options.body), payload);
});

test('未提供筛选时仍兼容原有分页请求', async () => {
  const response = { items: [], total: 0, page: 2, page_size: 20, pages: 0 };
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ data: response })));
  assert.deepEqual(await api.papers.list(2), response);
  assert.equal(fetchMock.mock.calls[0].arguments[0], '/api/papers?page=2&page_size=20');
});

test('组合条件和排序随分页发送，中文与特殊字符不改变参数含义', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ data: { items: [] } })));
  const filters = { title: ' 中文 & 100%_+ ', author: '王/李', tag_id: 2, year: 2024,
    reading_status: 'reading', research_topic: 'A&B', sort_by: 'year', sort_order: 'asc' };
  await api.papers.list(3, undefined, filters);
  const params = new URL(fetchMock.mock.calls[0].arguments[0], 'http://localhost').searchParams;
  assert.deepEqual(Object.fromEntries(params), { page: '3', page_size: '20', ...Object.fromEntries(
    Object.entries(filters).map(([key, value]) => [key, String(value).trim()])) });
});

test('清空条件不会发送空字符串或 undefined，也不会残留上次参数', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ data: { items: [] } })));
  await api.papers.list(2, undefined, { title: '旧条件', year: 2024, sort_by: 'year' });
  await api.papers.list(1, undefined, { title: '  ', author: '', year: undefined, sort_by: 'created_at', sort_order: 'desc' });
  const params = new URL(fetchMock.mock.calls[1].arguments[0], 'http://localhost').searchParams;
  assert.deepEqual(Object.fromEntries(params), { page: '1', page_size: '20', sort_by: 'created_at', sort_order: 'desc' });
});

test('网络失败显示可操作的连接提示', async () => {
  mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(api.tags.list(), /无法连接服务/);
});

test('代理返回 HTML 错误时仍提供统一 HTTP 错误', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('<h1>Bad Gateway</h1>', { status: 502 }));
  await assert.rejects(api.tags.list(), (error) => error instanceof ApiError && error.status === 502);
});

for (const body of ['null', '[]', '"unexpected"', '{}']) {
  test(`拒绝格式错误的成功响应 ${body}`, async () => {
    mock.method(globalThis, 'fetch', async () => new Response(body));
    await assert.rejects(api.tags.list(), /无法识别的数据/);
  });
}

test('请求取消保留 AbortError 供页面忽略旧响应', async () => {
  const controller = new AbortController();
  controller.abort();
  mock.method(globalThis, 'fetch', async (_url, options) => { options.signal.throwIfAborted(); });
  await assert.rejects(api.papers.get(1, controller.signal), (error) => error.name === 'AbortError');
});

test('笔记创建始终使用指定文献路径，更新只发送内容', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ data: { id: 8 } })));
  await api.notes.create(42, '阅读笔记');
  await api.notes.update(8, '修改后的笔记');
  assert.equal(fetchMock.mock.calls[0].arguments[0], '/api/papers/42/notes');
  assert.equal(fetchMock.mock.calls[1].arguments[0], '/api/notes/8');
  assert.deepEqual(JSON.parse(fetchMock.mock.calls[1].arguments[1].body), { content: '修改后的笔记' });
  assert.equal(errorMessage(null), '操作失败，请稍后重试。');
});
