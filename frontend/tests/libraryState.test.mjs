import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLibraryQuery } from '../src/utils/libraryState.ts';
import { paperListParams } from '../src/api/client.ts';

test('列表地址往返保留收藏、标签、中文搜索、排序和分页', () => {
  const query = paperListParams(3, { title: '注意力 & 公式', tag_id: 2, is_favorite: true, reading_status: 'reading', sort_by: 'year', sort_order: 'asc' });
  const parsed = parseLibraryQuery(query);
  assert.equal(parsed.page, 3); assert.equal(parsed.filters.title, '注意力 & 公式');
  assert.equal(parsed.filters.is_favorite, true); assert.equal(parsed.filters.tag_id, 2);
  assert.equal(parsed.filters.sort_by, 'year'); assert.equal(parsed.filters.sort_order, 'asc');
  const invalid = parseLibraryQuery('page=-2&tag_id=0&reading_status=broken&sort_by=bad');
  assert.equal(invalid.page, 1); assert.equal(invalid.filters.tag_id, undefined);
  assert.equal(invalid.filters.reading_status, undefined); assert.equal(invalid.filters.sort_by, 'created_at');
});
