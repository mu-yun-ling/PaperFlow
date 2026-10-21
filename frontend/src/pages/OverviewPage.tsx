import { useEffect, useState } from 'react';
import { Alert, Button, Card, Skeleton, Statistic, Tag } from 'antd';
import { api } from '../api/client';
import type { Dashboard } from '../types/api';

export function OverviewPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setData(null);
    Promise.all([api.health(controller.signal), api.dashboard(controller.signal)])
      .then(([, dashboard]) => setData(dashboard))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '暂时无法连接服务。');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  const metrics = data ? [
    { label: '全部文献', value: data.total, caption: '文献库总数' },
    { label: '等待开始', value: data.not_started, caption: '下一次探索' },
    { label: '正在阅读', value: data.reading, caption: '保持好奇' },
    { label: '已经读完', value: data.completed, caption: '积累新见解' },
  ] : [];

  return (
    <>
      <section className="intro">
        <p className="eyebrow">YOUR READING SPACE</p>
        <h1>每一次阅读，<br />都成为下一步的起点。</h1>
        <p className="intro-copy">在这里整理文献、记录想法，让零散的阅读逐渐连接。</p>
        <div className="connection-status" aria-live="polite">
          <Tag color={loading ? 'default' : error ? 'error' : 'success'}>
            {loading ? '正在连接文献库' : error ? '文献库未连接' : '已连接本地文献库'}
          </Tag>
          <Button size="small" onClick={() => setRevision((value) => value + 1)} loading={loading}>刷新</Button>
        </div>
      </section>

      {error && <Alert type="error" showIcon title="暂时无法加载文献库" description={error} />}
      {loading && <Card><Skeleton active paragraph={{ rows: 2 }} /></Card>}
      {!loading && data && <section className="metrics" aria-label="文献数量概览">
        {metrics.map((metric) => <Card key={metric.label}>
          <Statistic title={metric.label} value={metric.value} />
          <p className="metric-caption">{metric.caption}</p>
        </Card>)}
      </section>}

      <section className="workspace-note">
        <div className="note-mark" aria-hidden="true">01</div>
        <div>
          <h2>文献空间正在搭建</h2>
          <p>当前版本已搭建数据服务，以上数量来自本地文献库。文献录入、标签分类、笔记与阅读图表将在后续阶段开放。</p>
          <span className="version-label">第一阶段 · 基础服务</span>
        </div>
      </section>
    </>
  );
}
