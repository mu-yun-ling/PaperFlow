import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultFilters, hasFilters, normalizeFilters, yearError } from '../src/utils/paperFilters.ts';

test('空文本去掉首尾空白，默认恢复创建时间降序', () => {
  const result = normalizeFilters({ title: '  ', author: ' 张三 ', year: ' 2024 ', research_topic: ' NLP ' });
  assert.equal(result.title, undefined);
  assert.equal(result.author, '张三');
  assert.equal(result.year, 2024);
  assert.equal(result.research_topic, 'NLP');
  assert.equal(result.sort_by, 'created_at');
  assert.equal(result.sort_order, 'desc');
});

test('年份允许空值和边界，拒绝小数、指数、非法文本与越界值', () => {
  const max = new Date().getUTCFullYear() + 1;
  for (const value of [undefined, '', ' ', '1000', String(max)]) assert.equal(yearError(value), undefined);
  for (const value of ['999', String(max + 1), '2024.5', '2e3', 'abcd', '-2024']) assert.ok(yearError(value));
});

test('仅排序不被误判为筛选，每个业务条件均触发筛选空状态', () => {
  assert.equal(hasFilters(normalizeFilters(defaultFilters)), false);
  assert.equal(hasFilters({ sort_by: 'year', sort_order: 'asc' }), false);
  for (const filter of [{ title: 'A' }, { author: 'B' }, { tag_id: 1 }, { year: 2024 },
    { reading_status: 'not_started' }, { research_topic: 'NLP' }]) assert.equal(hasFilters(filter), true);
});
