import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRoute } from '../src/routing.ts';
import { safeExternalUrl } from '../src/utils/papers.ts';

test('页面地址可区分列表、新增、编辑、详情和标签', () => {
  assert.deepEqual(parseRoute(''), { page: 'papers' });
  assert.deepEqual(parseRoute('#/papers'), { page: 'papers' });
  assert.deepEqual(parseRoute('#/papers/new'), { page: 'new' });
  assert.deepEqual(parseRoute('#/papers/12'), { page: 'detail', id: 12 });
  assert.deepEqual(parseRoute('#/papers/12/edit'), { page: 'edit', id: 12 });
  assert.deepEqual(parseRoute('#/tags'), { page: 'tags' });
  assert.deepEqual(parseRoute('#/dashboard'), { page: 'dashboard' });
  assert.deepEqual(parseRoute('#/settings/ai'), { page: 'ai-settings' });
});

test('无效地址和无法安全表示的 ID 显示页面不存在', () => {
  for (const hash of ['#/papers/0', '#/papers/-1', '#/papers/9007199254740993', '#/papers/abc', '#/missing']) {
    assert.deepEqual(parseRoute(hash), { page: 'not-found' });
  }
});

test('原文链接只允许 HTTP(S)', () => {
  assert.equal(safeExternalUrl('https://example.org/paper'), 'https://example.org/paper');
  assert.equal(safeExternalUrl('http://example.org'), 'http://example.org/');
  for (const value of ['javascript:alert(1)', 'data:text/html,test', 'file:///tmp/test', 'not a url', null]) {
    assert.equal(safeExternalUrl(value), undefined);
  }
});
