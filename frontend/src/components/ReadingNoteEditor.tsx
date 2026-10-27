import { useId, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Input, InputNumber, Select, Space } from 'antd';
import { errorMessage } from '../api/client';
import { MarkdownView } from './MarkdownView';
import { noteExcerpts, serializeReadingNote, type NoteSource, type ReadingFields } from '../utils/readingNotes';

export function ReadingNoteEditor({ value, source, sourceFileId, currentPage, totalPages, editing, draftStatus, onChange, onSourceChange, onSave, onCancel, onSavingChange, onExplain, explaining }: {
  value: ReadingFields; source?: NoteSource; sourceFileId?: number; currentPage?: number; totalPages?: number;
  editing: boolean; draftStatus: string; onChange: (value: ReadingFields) => void; onSourceChange: (source?: NoteSource) => void;
  onSave: (content: string) => Promise<void>; onCancel: () => void; onSavingChange: (saving: boolean) => void;
  onExplain?: (source: NoteSource, text: string) => void; explaining?: boolean;
}) {
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [preview, setPreview] = useState(false);
  const lock = useRef(false);
  const pageInputId = useId();
  const excerpts = noteExcerpts(value, source);
  const update = (patch: Partial<ReadingFields>) => onChange({ ...value, ...patch });
  const setPage = (page: number | null) => sourceFileId && onSourceChange({ fileId: sourceFileId, page: page ?? 0, kind: 'manual' });
  async function save() {
    if (lock.current) return;
    if (excerpts.length > 200) { setError('单条笔记最多保留 200 段摘录，请另建笔记。'); return; }
    if (source && (source.fileId !== sourceFileId || !Number.isSafeInteger(source.page) || source.page < 1 || (totalPages && source.page > totalPages))) { setError('请重新关联原文，并填写有效页码。'); return; }
    if (!excerpts.some(item => item.text.trim()) && !value.understanding.trim()) { setError('请填写原文摘录或我的理解。'); return; }
    const content = serializeReadingNote(value, source);
    if (content.length > 50000) { setError('笔记内容过长，请缩短摘录或理解后再保存。'); return; }
    lock.current = true; setSaving(true); onSavingChange(true); setError('');
    try { await onSave(content); } catch (reason) { setError(errorMessage(reason)); }
    finally { lock.current = false; setSaving(false); onSavingChange(false); }
  }
  return <section className="reading-note-editor" aria-label="阅读笔记草稿">
    <div className="draft-heading"><strong>{editing ? '编辑阅读笔记' : '新建阅读笔记'}</strong><span role="status">{draftStatus}</span></div>
    {error && <Alert type="error" title={error} showIcon />}
    <div className="note-page-control"><label htmlFor={pageInputId}>关联页码</label><InputNumber id={pageInputId} aria-label="关联页码" min={1} max={totalPages} precision={0} controls={false} value={source?.page || null} disabled={saving || !sourceFileId} placeholder="全文" onChange={setPage} /><span>{totalPages ? `/ ${totalPages}` : '页'}</span>{currentPage && <Button size="small" onClick={() => setPage(currentPage)} disabled={saving}>使用当前页</Button>}<Checkbox checked={!source} disabled={saving || !sourceFileId} onChange={event => event.target.checked ? onSourceChange(undefined) : setPage(currentPage ?? 1)}>全文笔记</Checkbox></div>
    {source && source.fileId !== sourceFileId && <Alert type="warning" title="原文件已替换，请重新关联页码；旧摘录仍会保留。" />}
    <label>我的理解<Input.TextArea aria-label="我的理解" value={value.understanding} autoSize={{ minRows: 5, maxRows: 16 }} maxLength={20000} disabled={saving} onChange={event => update({ understanding: event.target.value })} placeholder={'用自己的话解释，记下疑问、证据和公式…\n支持 Markdown 与 $LaTeX$'} /></label>
    <details className="draft-excerpts" open={excerpts.length > 0 || undefined}><summary>原文摘录 · {excerpts.length} 段 <span>选中 PDF 文字可继续加入</span></summary>
      {excerpts.map((item, index) => <div className="draft-excerpt" key={index}><div><strong>{item.source ? `P.${item.source.page}` : '手动摘录'}</strong><Space size="small">{item.source?.fileId === sourceFileId && onExplain && <Button type="text" size="small" loading={explaining} disabled={saving || !item.text.trim()} onClick={() => onExplain(item.source!, item.text)}>AI 解释</Button>}<Button type="text" size="small" disabled={saving} onClick={() => update({ excerpt: '', excerpts: excerpts.filter((_, i) => i !== index) })}>移除摘录</Button></Space></div><Input.TextArea aria-label={`原文摘录 ${index + 1}`} value={item.text} autoSize={{ minRows: 2, maxRows: 6 }} maxLength={8000} disabled={saving} onChange={event => update({ excerpt: '', excerpts: excerpts.map((entry, i) => i === index ? { ...entry, text: event.target.value } : entry) })} /></div>)}
      <Button type="dashed" size="small" disabled={saving} onClick={() => update({ excerpt: '', excerpts: [...excerpts, { text: '' }] })}>手动添加摘录</Button>
    </details>
    <details className="draft-options"><summary>{value.tags.length ? `标签 · ${value.tags.length}` : '添加标签'}{value.chapter ? ' · 旧章节信息' : ''}</summary><Select aria-label="笔记标签" mode="tags" value={value.tags} tokenSeparators={[',', '，']} open={false} disabled={saving} onChange={tags => update({ tags: [...new Set(tags.map(tag => tag.trim().replace(/^#/, '')).filter(Boolean))] })} placeholder="输入标签后按回车" />{value.chapter && <p className="muted">原章节：{value.chapter}</p>}</details>
    {preview && <div className="draft-preview" aria-label="草稿排版预览"><h4>我的理解</h4><MarkdownView content={value.understanding || '尚未填写'} />{excerpts.map((item, i) => <div key={i}><h4>{item.source ? `原文 · P.${item.source.page}` : '原文摘录'}</h4><MarkdownView content={item.text || '尚未填写'} /></div>)}</div>}
    <div className="draft-actions"><Button type="text" onClick={() => setPreview(!preview)}>{preview ? '收起预览' : '预览排版'}</Button><Space><Button onClick={onCancel} disabled={saving}>收起草稿</Button><Button type="primary" onClick={() => void save()} loading={saving}>保存笔记</Button></Space></div>
  </section>;
}
