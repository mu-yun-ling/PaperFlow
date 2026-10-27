import { useRef, useState } from 'react';
import { Alert, Button, Input, Select, Space } from 'antd';
import { errorMessage } from '../api/client';
import { MarkdownView } from './MarkdownView';
import { serializeReadingNote, type NoteSource, type ReadingFields } from '../utils/readingNotes';

export function ReadingNoteEditor({ value, source, editing, onChange, onSave, onCancel, onSavingChange, onExplain, explaining }: {
  value: ReadingFields; source?: NoteSource; editing: boolean; onChange: (value: ReadingFields) => void;
  onSave: (content: string) => Promise<void>; onCancel: () => void; onSavingChange: (saving: boolean) => void;
  onExplain?: () => void; explaining?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const update = (patch: Partial<ReadingFields>) => onChange({ ...value, ...patch });
  async function save() {
    if (lock.current) return;
    if (!value.excerpt.trim() && !value.understanding.trim()) { setError('请填写原文摘录或我的理解。'); return; }
    const content = serializeReadingNote(value, source);
    if (content.length > 50000) { setError('笔记内容过长，请缩短摘录或理解后再保存。'); return; }
    lock.current = true; setSaving(true); onSavingChange(true); setError('');
    try { await onSave(content); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { lock.current = false; setSaving(false); onSavingChange(false); }
  }
  return <section className="reading-note-editor" aria-label="阅读笔记草稿">
    <div className="draft-heading"><strong>{editing ? '编辑阅读笔记' : '新建阅读笔记'}</strong><span>{source ? `P.${source.page} · 已关联原文` : '手动笔记 · 无页码关联'}</span></div>
    <p className="muted">补充你的理解后保存。摘录和理解均支持 Markdown + LaTeX。</p>
    {error && <Alert type="error" title={error} showIcon />}
    <label>章节（选填）<Input aria-label="章节（选填）" value={value.chapter} maxLength={200} disabled={saving} onChange={event => update({ chapter: event.target.value })} placeholder="例如：3.3 Dynamic Sampling" /></label>
    <label>原文摘录（选填）<Input.TextArea aria-label="原文摘录（选填）" value={value.excerpt} autoSize={{ minRows: 2, maxRows: 6 }} maxLength={8000} disabled={saving} onChange={event => update({ excerpt: event.target.value })} placeholder="从 PDF 摘录会自动带入，也可以手动填写" /></label>
    <label>我的理解<Input.TextArea aria-label="我的理解" value={value.understanding} autoSize={{ minRows: 5, maxRows: 14 }} maxLength={20000} disabled={saving} onChange={event => update({ understanding: event.target.value })} placeholder={'用自己的话解释这段内容，记下疑问或公式…\n支持 $行内公式$ 与 $$独立公式$$'} /></label>
    <label>标签（选填）<Select aria-label="笔记标签" mode="tags" value={value.tags} tokenSeparators={[',', '，']} open={false} disabled={saving} onChange={tags => update({ tags: [...new Set(tags.map(tag => tag.trim().replace(/^#/, '')).filter(Boolean))] })} placeholder="输入标签后按回车" /></label>
    <Space wrap><Button type="primary" onClick={() => void save()} loading={saving}>保存笔记</Button><Button onClick={onCancel} disabled={saving}>取消编辑</Button><Button type="text" onClick={() => setPreview(!preview)}>{preview ? '收起预览' : '预览排版'}</Button>{onExplain && <Button type="text" disabled={saving || !value.excerpt.trim()} loading={explaining} onClick={onExplain}>AI 解释原文</Button>}</Space>
    {preview && <div className="draft-preview" aria-label="草稿排版预览"><h4>原文摘录</h4><MarkdownView content={value.excerpt || '尚未填写'} /><h4>我的理解</h4><MarkdownView content={value.understanding || '尚未填写'} /></div>}
  </section>;
}
