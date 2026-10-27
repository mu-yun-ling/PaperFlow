import { useCallback, useEffect, useRef, useState } from 'react';
import { App, Button, Empty, Pagination, Progress, Segmented, Skeleton, Space, Tag } from 'antd';
import { api, paperListParams } from '../api/client';
import { useResource } from '../hooks/useResource';
import { PaperActions } from '../components/PaperActions';
import { LoadError } from '../components/LoadError';
import { ReadingStatusTag } from '../components/ReadingStatusTag';
import { PaperFilterBar } from '../components/PaperFilterBar';
import { defaultFilters, hasFilters, normalizeFilters, yearError } from '../utils/paperFilters';
import type { FilterValues } from '../utils/paperFilters';
import { formatTime } from '../utils/papers';
import { Icon } from '../components/Icon';
import { errorMessage } from '../api/client';
import { parseLibraryQuery } from '../utils/libraryState';

function initialQuery() {
  const query = window.location.hash.split('?')[1];
  if (query) return parseLibraryQuery(query);
  try { return parseLibraryQuery(sessionStorage.getItem('paperflow.library.query') || ''); } catch { return parseLibraryQuery(''); }
}

export function PaperListPage() {
  const { message } = App.useApp();
  const [view, setView] = useState(() => { try { return localStorage.getItem('paperflow.library.view') === 'compact' ? 'compact' : 'cards'; } catch { return 'cards'; } });
  const [favoriting, setFavoriting] = useState<number | null>(null);
  const initial = useRef(initialQuery());
  const restoreScroll = useRef((() => { try { const query = window.location.hash.split('?')[1]; return !query || query === sessionStorage.getItem('paperflow.library.query'); } catch { return false; } })());
  const [draft, setDraft] = useState<FilterValues>(initial.current.filters);
  const [query, setQuery] = useState({ page: initial.current.page, filters: normalizeFilters(initial.current.filters) });
  const restored = useRef(false);
  const [returnedPaper] = useState(() => { try { return sessionStorage.getItem('paperflow.library.paper'); } catch { return null; } });
  const { page, filters } = query;
  const invalidYear = yearError(draft.year);
  const draftKey = JSON.stringify(normalizeFilters(draft));
  const queryKey = JSON.stringify(filters);
  const pending = !invalidYear && draftKey !== queryKey;
  const load = useCallback((signal: AbortSignal) => api.papers.list(page, signal, filters), [page, filters]);
  const { data, loading, error, reload } = useResource(load);
  useEffect(() => {
    const params = paperListParams(page, filters); window.history.replaceState(null, '', `#/papers?${params}`);
    try { sessionStorage.setItem('paperflow.library.query', params); } catch { /* Filtering still works. */ }
  }, [page, queryKey]);
  useEffect(() => {
    const remember = () => { try { sessionStorage.setItem('paperflow.library.scroll', String(window.scrollY)); } catch { /* Optional preference. */ } };
    window.addEventListener('scroll', remember, { passive: true }); return () => window.removeEventListener('scroll', remember);
  }, []);
  useEffect(() => {
    if (!data || restored.current) return; restored.current = true;
    let offset = 0; try { if (restoreScroll.current) offset = Math.max(0, Number(sessionStorage.getItem('paperflow.library.scroll')) || 0); } catch { /* Start at top. */ }
    const frame = requestAnimationFrame(() => window.scrollTo(0, offset)); return () => cancelAnimationFrame(frame);
  }, [data]);

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
    <div className="page-heading library-heading"><div><span className="section-caption">YOUR LIBRARY</span><h1>文献库<span className="heading-dot">.</span></h1><p>收藏值得读的论文，连接正在生长的想法。</p></div>
      <Space><Button type="text" onClick={reload} loading={loading}>刷新</Button><Button type="primary" icon={<Icon name="plus" size={16} />} href="#/papers/new">新增文献</Button></Space>
    </div>
    <PaperFilterBar values={draft} onChange={setDraft} onClear={clearFilters} invalidYear={invalidYear} />
    <div className="library-results-toolbar"><p className="query-summary" role="status">{invalidYear ? '年份条件无效，列表保留上次有效查询结果。'
      : pending || loading ? '正在查询文献…' : error ? '查询失败，请重试。'
      : `${hasFilters(filters) ? '筛选结果' : '全部文献'} · ${data?.total ?? 0} 篇`}</p><Segmented aria-label="文献显示方式" value={view} onChange={value => { setView(value); try { localStorage.setItem('paperflow.library.view', value); } catch { /* 无存储时仍可切换。 */ } }} options={[{ value: 'cards', label: <span title="卡片视图"><Icon name="grid" size={15} /><span className="sr-only">卡片视图</span></span> }, { value: 'compact', label: <span title="紧凑视图"><Icon name="list" size={15} /><span className="sr-only">紧凑视图</span></span> }]} /></div>
    {error ? <LoadError error={error} retry={reload} /> : loading && !data ? <Skeleton active paragraph={{ rows: 8 }} /> :
      data?.items.length ? <div className={`library-grid view-${view} ${loading || pending ? 'is-updating' : ''}`} aria-busy={loading || pending}>
        {data.items.map(paper => <article id={`paper-${paper.id}`} className={`library-card${returnedPaper === String(paper.id) ? ' returned-paper' : ''}`} key={paper.id} onClick={() => { try { sessionStorage.setItem('paperflow.library.paper', String(paper.id)); } catch { /* Optional preference. */ } }}>
          <div className="library-card-top"><span className="paper-year">{paper.year || '年份待补充'}</span><Space size={0}><Button type="text" size="small" aria-label={paper.is_favorite ? '取消收藏' : '收藏文献'} aria-pressed={paper.is_favorite} className={paper.is_favorite ? 'favorite-active' : 'favorite-button'} disabled={favoriting !== null || loading || pending} onClick={async () => { setFavoriting(paper.id); try { await api.papers.update(paper.id, { is_favorite: !paper.is_favorite }); reload(); } catch (reason) { message.error(errorMessage(reason)); } finally { setFavoriting(null); } }} icon={<Icon name="star" size={16} />} />
            <PaperActions id={paper.id} onDeleted={afterDelete} disabled={loading || pending} /></Space></div>
          <h2><a href={`#/papers/${paper.id}`}>{paper.title}</a></h2><p className="library-authors">{paper.authors || '作者未填写'}</p>
          <div className="library-tags"><Space size={[4, 4]} wrap>{paper.tags.map(tag => <Tag key={tag.id}>{tag.name}</Tag>)}</Space></div>
          <p className="library-abstract">{paper.abstract || '从标题出发，开始这篇论文的探索。'}</p>
          <div className="library-progress"><ReadingStatusTag status={paper.reading_status} /><Progress percent={paper.reading_progress?.percent ?? 0} strokeColor={paper.reading_status === 'completed' ? '#729c7b' : '#315f4d'} format={value => `${value}%`} size="small" /></div>
          <div className="library-card-footer"><span>{paper.reading_progress?.last_read_at ? `最近阅读 ${formatTime(paper.reading_progress.last_read_at)}` : '等待下一次灵感'}</span><a href={`#/papers/${paper.id}`}>打开文献 ↗</a></div>
        </article>)}
      </div> : <div className="library-empty"><Empty description={hasFilters(filters) ? '没有找到符合条件的文献，试试调整或清空筛选。' : '还没有文献，添加第一篇开始阅读吧。'} /></div>}
    <Pagination className="library-pagination" current={page} pageSize={20} total={data?.total ?? 0} showSizeChanger={false}
      disabled={loading || pending || !!invalidYear} onChange={setPage} showTotal={(total) => `共 ${total} 篇文献`} hideOnSinglePage />
  </>;
}
