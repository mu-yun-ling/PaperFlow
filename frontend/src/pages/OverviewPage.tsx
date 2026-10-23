import { useEffect } from 'react';
import { Button, Card, Empty, Skeleton, Space, Statistic } from 'antd';
import { api } from '../api/client';
import { DashboardCharts } from '../components/DashboardCharts';
import { LoadError } from '../components/LoadError';
import { useResource } from '../hooks/useResource';

export function OverviewPage() {
  const { data, error, loading, reload } = useResource(api.dashboard);

  useEffect(() => {
    // 重新进入页面会重新获取；其他窗口修改后，恢复焦点或可见时也会同步。
    const refreshVisible = () => { if (document.visibilityState === 'visible') reload(); };
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => {
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [reload]);

  const metrics = data ? [
    { label: '文献总数', value: data.total },
    { label: '已读完', value: data.completed },
    { label: '阅读中', value: data.reading },
    { label: '未开始', value: data.not_started },
  ] : [];

  return <>
    <section className="page-heading">
      <div><h1>阅读概览</h1><p>查看整个文献库的阅读进度与年份分布。</p></div>
      <Space wrap>
        <Button onClick={reload} loading={loading}>刷新统计</Button>
        <Button type="primary" href="#/papers/new">新增文献</Button>
      </Space>
    </section>
    <p className="muted" role="status">{loading
      ? '正在更新统计…'
      : error ? '统计加载失败，请重试。' : '统计来自当前文献库；返回本页或切回窗口时自动更新。'}</p>
    {!!error && <LoadError error={error} retry={reload} />}
    {loading && !data && <Card><Skeleton active paragraph={{ rows: 4 }} /></Card>}
    {data && !error && <div aria-busy={loading}>
      <section className="metrics" aria-label="文献数量概览">
        {metrics.map((metric) => <Card key={metric.label}>
          <Statistic title={metric.label} value={metric.value} />
        </Card>)}
      </section>
      {data.total === 0
        ? <Card className="dashboard-empty"><Empty description="还没有文献，添加第一篇后即可查看统计图表。">
          <Button type="primary" href="#/papers/new">新增文献</Button>
        </Empty></Card>
        : <DashboardCharts data={data} />}
    </div>}
  </>;
}
