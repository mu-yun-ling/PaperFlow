import type { Dashboard } from '../types/api';

export function dashboardSeries(data: Dashboard) {
  const labels = { not_started: '未开始', reading: '阅读中', completed: '已读完' };
  return {
    statuses: data.by_status.map(({ status, count }) => ({ name: labels[status], value: count })),
    years: data.by_year.map(({ year, count }) => ({ name: year === null ? '未填写' : String(year), value: count })),
  };
}
