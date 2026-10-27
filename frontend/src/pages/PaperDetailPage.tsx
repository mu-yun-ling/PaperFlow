import { useCallback, useState } from 'react';
import { App, Button, Skeleton, Space, Tabs, Tag } from 'antd';
import { api, errorMessage } from '../api/client';
import { PaperActions } from '../components/PaperActions';
import { LoadError } from '../components/LoadError';
import { NotesPanel } from '../components/NotesPanel';
import { FilesPanel } from '../components/FilesPanel';
import { AIPanel } from '../components/AIPanel';
import { ReadingStatusTag } from '../components/ReadingStatusTag';
import { useResource } from '../hooks/useResource';
import { navigate } from '../routing';
import { formatTime, safeExternalUrl } from '../utils/papers';

export function PaperDetailPage({ id }: { id: number }) {
  const { message } = App.useApp();
  const load = useCallback((signal: AbortSignal) => api.papers.get(id, signal), [id]);
  const { data: paper, error, loading, reload, setData } = useResource(load);
  const [saving, setSaving] = useState(false);
  const [notesTab, setNotesTab] = useState('notes');
  const [createRequest, setCreateRequest] = useState(0);
  const [notesVersion, setNotesVersion] = useState(0);
  const [openRequest, setOpenRequest] = useState<{ page: number; token: number }>();

  async function toggleFavorite() {
    if (saving || !paper) return;
    setSaving(true);
    try { setData(await api.papers.update(id, { is_favorite: !paper.is_favorite })); }
    catch (reason) { message.error(errorMessage(reason)); }
    finally { setSaving(false); }
  }
  if (loading) return <div className="page-loading"><Skeleton active paragraph={{ rows: 10 }} /></div>;
  if (error) return <div className="page-loading"><LoadError error={error} retry={reload} /></div>;
  if (!paper) return null;
  const externalUrl = safeExternalUrl(paper.url);
  const doiUrl = paper.doi ? `https://doi.org/${paper.doi.split('/').map(encodeURIComponent).join('/')}` : undefined;

  return <div className="paper-detail">
    <div className="detail-toolbar"><a className="back-link" href="#/papers">← 返回文献库</a><Space>
      <Button type="text" onClick={toggleFavorite} loading={saving}>{paper.is_favorite ? '★ 已收藏' : '☆ 收藏文献'}</Button>
      <PaperActions id={id} onDeleted={() => navigate('/papers')} disabled={saving} />
    </Space></div>
    <header className="detail-title"><div className="detail-overline"><span>READ · THINK · CONNECT</span><ReadingStatusTag status={paper.reading_status} /></div>
      <h1>{paper.title}</h1><p className="break-text">{paper.authors || '作者未填写'}{paper.year ? ` · ${paper.year}` : ''}</p>
      {!!paper.tags.length && <Space wrap size={[4, 6]}>{paper.tags.map(tag => <Tag key={tag.id}>{tag.name}</Tag>)}</Space>}
    </header>
    <FilesPanel paperId={id} paperFile={paper.paper_file} onChanged={reload} openRequest={openRequest} onOpenHandled={() => setOpenRequest(undefined)} />
    <div className="detail-content-grid"><div className="reading-main">
      <section className="abstract-card"><div className="section-caption">ABSTRACT</div><h2>摘要</h2>
        <p className="note-content">{paper.abstract || '还没有摘要。添加几句话，为下一次阅读留下线索。'}</p></section>
      <AIPanel paperId={id} onTagsChanged={setData} onNoteSaved={() => { setNotesVersion(value => value + 1); setNotesTab('notes'); }} />
      <section className="reading-notes" id="paper-notes"><div className="notes-title-row"><div><div className="section-caption">YOUR IDEAS</div><h2>我的阅读笔记</h2></div>
        <Space wrap><Button onClick={() => setNotesTab('attachments')}>上传笔记</Button>
          <Button type="primary" onClick={() => { setNotesTab('notes'); setCreateRequest(value => value + 1); }}>＋ 新建笔记</Button></Space></div>
        <Tabs activeKey={notesTab} onChange={setNotesTab} items={[
          { key: 'notes', label: '在线笔记', children: <NotesPanel paperId={id} refreshVersion={notesVersion} hideCreate createRequest={createRequest} onCreateHandled={() => setCreateRequest(0)} sourceFileId={paper.paper_file?.id} onJump={page => setOpenRequest({ page, token: Date.now() })} /> },
          { key: 'attachments', label: `笔记附件${paper.note_attachments.length ? ` · ${paper.note_attachments.length}` : ''}`,
            children: <FilesPanel paperId={id} notes={paper.note_attachments} onChanged={reload} /> },
        ]} />
      </section>
    </div><aside className="paper-context"><section className="paper-info-card"><h2>论文信息</h2>
      <dl className="paper-metadata"><dt>研究主题</dt><dd>{paper.research_topic || '尚未归类'}</dd>
        <dt>作者</dt><dd>{paper.authors || '未填写'}</dd><dt>发表年份</dt><dd>{paper.year || '未填写'}</dd>
        {paper.venue && <><dt>期刊 / 会议</dt><dd>{paper.venue}</dd></>}
        {doiUrl && <><dt>DOI</dt><dd><a href={doiUrl} target="_blank" rel="noopener noreferrer">{paper.doi} ↗</a></dd></>}
        {externalUrl && <><dt>来源</dt><dd><a href={externalUrl} target="_blank" rel="noopener noreferrer">访问原始链接 ↗</a></dd></>}
      </dl><Button type="text" className="metadata-edit" href={`#/papers/${id}/edit`}>补充论文信息 ↗</Button>
      <details className="paper-timestamps"><summary>收录信息</summary><p>创建于 {formatTime(paper.created_at)}</p><p>更新于 {formatTime(paper.updated_at)}</p></details>
    </section><div className="reading-tip"><span>留一点空间给思考</span><p>不止收藏论文，也收集自己的理解。公式、疑问和灵感，都可以留在笔记里。</p></div></aside></div>
  </div>;
}
