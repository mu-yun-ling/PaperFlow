import { useEffect } from 'react';
import { Button, Card, Empty, Progress, Skeleton, Space, Statistic } from 'antd';
import { api } from '../api/client';
import { DashboardCharts } from '../components/DashboardCharts';
import { LoadError } from '../components/LoadError';
import { useResource } from '../hooks/useResource';
import { Icon, type IconName } from '../components/Icon';
import { ReadingGarden } from '../components/ReadingGarden';
import { formatTime } from '../utils/papers';

export function OverviewPage() {
  const { data, error, loading, reload } = useResource(api.dashboard);
  useEffect(() => {
    const revealStatistics = () => { if (window.location.hash.endsWith('#statistics')) document.getElementById('statistics')?.scrollIntoView({ block: 'start' }); };
    revealStatistics();
    window.addEventListener('hashchange', revealStatistics);
    return () => window.removeEventListener('hashchange', revealStatistics);
  }, [data]);

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
    { label: '文献总数', value: data.total, icon: 'library' },
    { label: '已读完', value: data.completed, icon: 'check' },
    { label: '阅读中', value: data.reading, icon: 'book' },
    { label: '未开始', value: data.not_started, icon: 'clock' },
  ] : [];

  return <>
    <section className="page-heading dashboard-welcome">
      <ReadingGarden />
      <div className="welcome-copy"><span className="section-caption">A LITTLE READING, EVERY DAY</span><h1>让知识，在这里生长。</h1><p>记录每一次阅读，连接更多的想法。</p>
      <Space wrap>
        <Button type="primary" href="#/papers" icon={<Icon name="book" size={16} />}>继续探索</Button>
        <Button type="text" onClick={reload} loading={loading}>刷新统计 ↻</Button>
      </Space></div>
    </section>
    <p className="sr-only" role="status">{loading
      ? '正在更新统计…'
      : error ? '统计加载失败，请重试。' : '统计来自当前文献库；返回本页或切回窗口时自动更新。'}</p>
    {!!error && <LoadError error={error} retry={reload} />}
    {loading && !data && <Card><Skeleton active paragraph={{ rows: 4 }} /></Card>}
    {data && !error && <div aria-busy={loading}>
      <section className="metrics" id="statistics" aria-label="文献数量概览">
        {metrics.map((metric, index) => <Card key={metric.label} className={`metric-${index}`}>
          <span className="metric-icon"><Icon name={metric.icon as IconName} size={21} /></span>
          <Statistic title={metric.label} value={metric.value} />
        </Card>)}
      </section>
      {data.total === 0
        ? <Card className="dashboard-empty"><Empty description="还没有文献，添加第一篇后即可查看统计图表。">
          <Button type="primary" href="#/papers/new">新增文献</Button>
        </Empty></Card>
        : <DashboardCharts data={data} />}
      <div className="dashboard-bottom"><section className="dashboard-panel recent-reading"><div className="panel-heading"><h2>最近阅读</h2><a href="#/papers">查看全部 →</a></div>
        {data.recent_papers?.length ? data.recent_papers.map(paper => <a className="recent-paper" href={`#/papers/${paper.id}`} key={paper.id}><span className="recent-paper-icon"><Icon name="library" size={22} /></span><span className="recent-paper-title"><strong>{paper.title}</strong><small>{paper.authors || '作者待补充'} · {paper.year || '年份待补充'}</small></span><Progress percent={paper.reading_progress?.percent ?? 0} size="small" /><time>{formatTime(paper.reading_progress!.last_read_at!)}</time></a>) : <div className="dashboard-placeholder"><Icon name="book" size={24} /><p>从一篇好论文开始。阅读过的文献会留在这里。</p><a href="#/papers">打开文献库 →</a></div>}
      </section><section className="dashboard-panel"><div className="panel-heading"><h2>我的标签</h2><a href="#/tags">管理标签 →</a></div><div className="dashboard-tags">{data.by_tag.length ? data.by_tag.slice(0, 12).map(tag => <a href="#/tags" key={tag.id}>{tag.name}<span>{tag.count}</span></a>) : <p className="muted">用标签连接你的研究兴趣。</p>}</div><p className="tag-footnote">让零散的阅读，慢慢连成自己的知识地图。</p></section></div>
    </div>}
  </>;
}
