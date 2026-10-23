import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dashboardSeries } from '../src/utils/dashboard.ts';

test('图表保留真实数量、零值状态及空年份，聚合总数一致', () => {
  const input = { total: 7, by_status: [
    { status: 'not_started', count: 0 }, { status: 'reading', count: 5 }, { status: 'completed', count: 2 },
  ], by_year: [{ year: 2020, count: 2 }, { year: 2024, count: 4 }, { year: null, count: 1 }] };
  const series = dashboardSeries(input);
  assert.deepEqual(series.statuses, [
    { name: '未开始', value: 0 }, { name: '阅读中', value: 5 }, { name: '已读完', value: 2 },
  ]);
  assert.deepEqual(series.years, [
    { name: '2020', value: 2 }, { name: '2024', value: 4 }, { name: '未填写', value: 1 },
  ]);
  for (const items of Object.values(series)) assert.equal(items.reduce((sum, item) => sum + item.value, 0), input.total);
});

test('刷新后移除消失的年份，不残留旧数据，空库无虚构图表数据', () => {
  dashboardSeries({ by_status: [{ status: 'reading', count: 3 }], by_year: [{ year: 2020, count: 3 }] });
  assert.deepEqual(dashboardSeries({ by_status: [{ status: 'completed', count: 1 }], by_year: [{ year: null, count: 1 }] }), {
    statuses: [{ name: '已读完', value: 1 }], years: [{ name: '未填写', value: 1 }],
  });
  assert.deepEqual(dashboardSeries({ by_status: [], by_year: [] }), { statuses: [], years: [] });
});
