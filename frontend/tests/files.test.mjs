import assert from 'node:assert/strict';
import { test, afterEach, mock } from 'node:test';
import { api, ApiError } from '../src/api/client.ts';

afterEach(() => mock.restoreAll());

test('阅读位置绑定文件 ID，打开和阅读事件分别保留 false / true', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ data: { percent: 50 } })));
  for (const read of [false, true]) {
    assert.deepEqual(await api.files.progress(17, { total_pages: 8, current_page: 4, read }), { percent: 50 });
    const [url, options] = fetchMock.mock.calls.at(-1).arguments;
    assert.equal(url, '/api/files/17/reading-progress');
    assert.equal(options.method, 'PUT');
    assert.deepEqual(JSON.parse(options.body), { total_pages: 8, current_page: 4, read });
  }
});

test('文献和 PDF 使用同一 multipart 请求，浏览器生成 boundary', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ data: { id: 1 } })));
  const file = new File(['%PDF-1.7'], '中文论文.pdf', { type: 'application/pdf' });
  const body = { title: '标题', authors: '', year: null };
  await api.papers.create(body, file);
  await api.papers.update(1, body, file);
  for (const call of fetchMock.mock.calls) {
    const [, options] = call.arguments;
    assert.ok(options.body instanceof FormData);
    assert.equal(options.headers, undefined);
    assert.deepEqual(JSON.parse(options.body.get('data')), body);
    assert.equal(options.body.get('file').name, '中文论文.pdf');
  }
  assert.equal(fetchMock.mock.calls[1].arguments[1].method, 'PATCH');
});

test('解析仅调用预填接口，笔记附件绑定当前文献', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ data: {} })));
  const file = new File(['%PDF-1.7'], 'test.pdf', { type: 'application/pdf' });
  await api.files.parse(file);
  await api.files.uploadNote(42, file);
  assert.equal(fetchMock.mock.calls[0].arguments[0], '/api/papers/parse-pdf');
  assert.equal(fetchMock.mock.calls[1].arguments[0], '/api/papers/42/note-attachments');
  assert.deepEqual([...fetchMock.mock.calls[0].arguments[1].body.keys()], ['file']);
});

test('文件读取返回 Blob，文件不存在时保留结构化错误', async () => {
  mock.method(globalThis, 'fetch', async () => new Response('%PDF-1.7', { headers: { 'Content-Type': 'application/pdf' } }));
  const blob = await api.files.read(3);
  assert.ok(blob instanceof Blob);
  assert.equal(blob.type, 'application/pdf');
  assert.equal(await blob.text(), '%PDF-1.7');
  mock.restoreAll();
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: { code: 'FILE_NOT_FOUND', message: '文件不存在' } }), { status: 404 }));
  await assert.rejects(api.files.read(3), error => error instanceof ApiError && error.code === 'FILE_NOT_FOUND');
});

test('删除附件使用文件 ID，204 不解析响应正文', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(null, { status: 204 }));
  assert.equal(await api.files.delete(7), undefined);
  assert.equal(fetchMock.mock.calls[0].arguments[0], '/api/files/7');
  assert.equal(fetchMock.mock.calls[0].arguments[1].method, 'DELETE');
});

test('切换笔记时取消旧文件请求，保留取消原因而非显示连接失败', async () => {
  mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  const controller = new AbortController();
  const pending = api.files.read(3, controller.signal);
  controller.abort();
  await assert.rejects(pending, error => error.name === 'AbortError');
});
