import { useCallback, useState } from 'react';
import { App, Button, Card, Descriptions, Select, Skeleton, Space, Switch, Tag } from 'antd';
import { api, errorMessage } from '../api/client';
import { DeletePaperButton } from '../components/DeletePaperButton';
import { LoadError } from '../components/LoadError';
import { NotesPanel } from '../components/NotesPanel';
import { useResource } from '../hooks/useResource';
import { navigate } from '../routing';
import type { PaperInput, ReadingStatus } from '../types/api';
import { formatTime, readingOptions, safeExternalUrl } from '../utils/papers';

export function PaperDetailPage({ id }: { id: number }) {
  const { message } = App.useApp();
  const load = useCallback((signal: AbortSignal) => api.papers.get(id, signal), [id]);
  const { data: paper, error, loading, reload, setData } = useResource(load);
  const [saving, setSaving] = useState(false);

  async function update(values: Partial<PaperInput>) {
    if (saving) return;
    setSaving(true);
    try { setData(await api.papers.update(id, values)); message.success('已保存'); }
    catch (reason) { message.error(errorMessage(reason)); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="page-loading"><Skeleton active paragraph={{ rows: 10 }} /></div>;
  if (error) return <div className="page-loading"><LoadError error={error} retry={reload} /></div>;
  if (!paper) return null;
  const externalUrl = safeExternalUrl(paper.url);
  const doiUrl = paper.doi ? `https://doi.org/${paper.doi.split('/').map(encodeURIComponent).join('/')}` : undefined;

  return <>
    <div className="detail-toolbar"><Button href="#/papers">返回文献列表</Button><Space>
      <Button href={`#/papers/${id}/edit`} disabled={saving}>编辑文献</Button>
      <DeletePaperButton id={id} onDeleted={() => navigate('/papers')} disabled={saving} />
    </Space></div>
    <div className="detail-title"><h1>{paper.title}</h1><p className="break-text">{paper.authors}</p></div>
    <Card className="detail-card">
      <div className="reading-controls">
        <Space><label htmlFor="detail-reading-status">阅读状态</label><Select id="detail-reading-status" aria-label="阅读状态"
          value={paper.reading_status} options={readingOptions} disabled={saving} className="status-select"
          onChange={(status: ReadingStatus) => update({ reading_status: status })} /></Space>
        <Space><span id="favorite-label">收藏</span><Switch aria-labelledby="favorite-label" checked={paper.is_favorite}
          checkedChildren="已收藏" unCheckedChildren="未收藏" disabled={saving} loading={saving}
          onChange={(value) => update({ is_favorite: value })} /></Space>
      </div>
      <Descriptions column={{ xs: 1, sm: 2 }} size="small" items={[
        { key: 'year', label: '年份', children: paper.year ?? '未填写' },
        { key: 'venue', label: '期刊 / 会议', children: paper.venue || '未填写' },
        { key: 'doi', label: 'DOI', children: doiUrl ? <a href={doiUrl} target="_blank" rel="noopener noreferrer" className="break-text">{paper.doi}</a> : '未填写' },
        { key: 'url', label: '原文链接', children: externalUrl ? <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="break-text">{paper.url}</a> : '未填写' },
        { key: 'topic', label: '研究主题', children: paper.research_topic || '未填写' },
        { key: 'tags', label: '标签', children: paper.tags.length ? <Space wrap size={[0, 4]}>{paper.tags.map((tag) => <Tag key={tag.id}>{tag.name}</Tag>)}</Space> : '无标签' },
        { key: 'created', label: '创建时间', children: formatTime(paper.created_at) },
        { key: 'updated', label: '更新时间', children: formatTime(paper.updated_at) },
      ]} />
      <div className="abstract-section"><h2>摘要</h2><p className="note-content">{paper.abstract || '暂未填写摘要。'}</p></div>
    </Card>
    <NotesPanel paperId={id} />
  </>;
}
