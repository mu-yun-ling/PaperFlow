import { useCallback, useEffect, useState } from 'react';
import { Button, Empty, Space, Table, Tag } from 'antd';
import type { TableProps } from 'antd';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { DeletePaperButton } from '../components/DeletePaperButton';
import { LoadError } from '../components/LoadError';
import { ReadingStatusTag } from '../components/ReadingStatusTag';
import type { Paper } from '../types/api';
import { formatTime } from '../utils/papers';

export function PaperListPage() {
  const [page, setPage] = useState(1);
  const load = useCallback((signal: AbortSignal) => api.papers.list(page, signal), [page]);
  const { data, loading, error, reload } = useResource(load);

  useEffect(() => {
    if (data && !loading && !error && page > Math.max(1, data.pages)) setPage(Math.max(1, data.pages));
  }, [data, loading, error, page]);

  function afterDelete() {
    if (data?.items.length === 1 && page > 1) setPage(page - 1);
    else reload();
  }

  const columns: TableProps<Paper>['columns'] = [
    { title: '标题', dataIndex: 'title', width: 270, render: (title: string, paper) =>
      <a className="paper-title" href={`#/papers/${paper.id}`}>{paper.is_favorite && <span aria-label="已收藏">★ </span>}{title}</a> },
    { title: '作者', dataIndex: 'authors', width: 170, render: (value: string) => <span className="break-text">{value}</span> },
    { title: '年份', dataIndex: 'year', width: 80, render: (value: number | null) => value ?? '—' },
    { title: '标签', dataIndex: 'tags', width: 160, render: (tags: Paper['tags']) => tags.length
      ? <Space size={[0, 4]} wrap>{tags.map((tag) => <Tag key={tag.id}>{tag.name}</Tag>)}</Space> : <span className="muted">无标签</span> },
    { title: '阅读状态', dataIndex: 'reading_status', width: 110, render: (value: Paper['reading_status']) => <ReadingStatusTag status={value} /> },
    { title: '更新时间', dataIndex: 'updated_at', width: 165, render: formatTime },
    { title: '操作', key: 'actions', width: 150, render: (_, paper) => <Space>
      <Button size="small" href={`#/papers/${paper.id}/edit`}>编辑</Button>
      <DeletePaperButton id={paper.id} onDeleted={afterDelete} disabled={loading} />
    </Space> },
  ];

  return <>
    <div className="page-heading"><div><h1>文献库</h1><p>收好每一篇文献，记录每一次思考。</p></div>
      <Space><Button onClick={reload} loading={loading}>刷新</Button><Button type="primary" href="#/papers/new">新增文献</Button></Space>
    </div>
    {error ? <LoadError error={error} retry={reload} /> : <Table<Paper> rowKey="id" columns={columns}
      dataSource={data?.items ?? []} loading={loading} scroll={{ x: 1100 }}
      locale={{ emptyText: <Empty description="还没有文献，添加第一篇开始阅读吧。" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      pagination={{ current: page, pageSize: 20, total: data?.total ?? 0, showSizeChanger: false,
        onChange: setPage, showTotal: (total) => `共 ${total} 篇文献`, hideOnSinglePage: true }} />}
  </>;
}
