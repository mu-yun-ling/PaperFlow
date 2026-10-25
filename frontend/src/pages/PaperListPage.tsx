import { useCallback, useEffect, useState } from 'react';
import { Button, Empty, Pagination, Progress, Skeleton, Space, Tag } from 'antd';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { PaperActions } from '../components/PaperActions';
import { LoadError } from '../components/LoadError';
import { ReadingStatusTag } from '../components/ReadingStatusTag';
import { PaperFilterBar } from '../components/PaperFilterBar';
import { defaultFilters, hasFilters, normalizeFilters, yearError } from '../utils/paperFilters';
import type { FilterValues } from '../utils/paperFilters';
import { formatTime } from '../utils/papers';

export function PaperListPage() {
  const [draft, setDraft] = useState<FilterValues>(defaultFilters);
  const [query, setQuery] = useState({ page: 1, filters: normalizeFilters(defaultFilters) });
  const { page, filters } = query;
  const invalidYear = yearError(draft.year);
  const draftKey = JSON.stringify(normalizeFilters(draft));
  const queryKey = JSON.stringify(filters);
  const pending = !invalidYear && draftKey !== queryKey;
  const load = useCallback((signal: AbortSignal) => api.papers.list(page, signal, filters), [page, filters]);
  const { data, loading, error, reload } = useResource(load);

  useEffect(() => {
    if (invalidYear || draftKey === queryKey) return;
    // 合并短时间连续输入；条件与页码一起更新，避免带旧页码查询新条件。
    const timer = setTimeout(() => setQuery({ page: 1, filters: JSON.parse(draftKey) }), 300);
    return () => clearTimeout(timer);
  }, [draftKey, queryKey, invalidYear]);

  function setPage(next: number) { setQuery((current) => ({ ...current, page: next })); }
  function clearFilters() {
    setDraft(defaultFilters);
    setQuery({ page: 1, filters: normalizeFilters(defaultFilters) });
  }

  useEffect(() => {
    if (data && !loading && !error && page > Math.max(1, data.pages)) setPage(Math.max(1, data.pages));
  }, [data, loading, error, page]);

  function afterDelete() {
    if (data?.items.length === 1 && page > 1) {
      // 删除请求完成时用户可能已换了条件，不把旧查询的页码写回新查询。
      setQuery((current) => current === query ? { ...current, page: page - 1 } : current);
    }
    reload();
  }

  return <>
    <div className="page-heading library-heading"><div><span className="section-caption">A SPACE FOR YOUR CURIOSITY</span><h1>让知识，在这里生长。</h1><p>你的文献库。每一篇阅读，都连接一个新的想法。</p></div>
      <Space><Button type="text" onClick={reload} loading={loading}>刷新</Button><Button type="primary" size="large" href="#/papers/new">＋ 收录文献</Button></Space>
    </div>
    <PaperFilterBar values={draft} onChange={setDraft} onClear={clearFilters} invalidYear={invalidYear} />
    <p className="query-summary" role="status">{invalidYear ? '年份条件无效，列表保留上次有效查询结果。'
      : pending || loading ? '正在查询文献…' : error ? '查询失败，请重试。'
      : `${hasFilters(filters) ? '筛选结果' : '全部文献'}：共 ${data?.total ?? 0} 篇`}</p>
    {error ? <LoadError error={error} retry={reload} /> : loading && !data ? <Skeleton active paragraph={{ rows: 8 }} /> :
      data?.items.length ? <div className={`library-grid ${loading || pending ? 'is-updating' : ''}`} aria-busy={loading || pending}>
        {data.items.map(paper => <article className="library-card" key={paper.id}>
          <div className="library-card-top"><span className="paper-year">{paper.year || '待探索'}{paper.is_favorite && ' · ★ 收藏'}</span>
            <PaperActions id={paper.id} onDeleted={afterDelete} disabled={loading || pending} /></div>
          <h2><a href={`#/papers/${paper.id}`}>{paper.title}</a></h2><p className="library-authors">{paper.authors || '作者未填写'}</p>
          <p className="library-abstract">{paper.abstract || '从标题出发，开始这篇论文的探索。'}</p>
          <div className="library-tags"><Space size={[4, 4]} wrap>{paper.tags.map(tag => <Tag key={tag.id}>{tag.name}</Tag>)}</Space></div>
          <div className="library-progress"><ReadingStatusTag status={paper.reading_status} />{paper.reading_progress && <Progress percent={paper.reading_progress.percent} format={value => `${value}%`} size="small" />}</div>
          <div className="library-card-footer"><span>{paper.reading_progress?.last_read_at ? `最近阅读 ${formatTime(paper.reading_progress.last_read_at)}` : '等待下一次灵感'}</span><a href={`#/papers/${paper.id}`}>打开文献 ↗</a></div>
        </article>)}
      </div> : <div className="library-empty"><Empty description={hasFilters(filters) ? '没有找到符合条件的文献，试试调整或清空筛选。' : '还没有文献，添加第一篇开始阅读吧。'} /></div>}
    <Pagination className="library-pagination" current={page} pageSize={20} total={data?.total ?? 0} showSizeChanger={false}
      disabled={loading || pending || !!invalidYear} onChange={setPage} showTotal={(total) => `共 ${total} 篇文献`} hideOnSinglePage />
  </>;
}
