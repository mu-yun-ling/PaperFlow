import { useCallback, useEffect, useRef, useState } from 'react';
import { App, Button, Card, Dropdown, Empty, Skeleton, Space } from 'antd';
import { api, errorMessage } from '../api/client';
import { useResource } from '../hooks/useResource';
import type { Note } from '../types/api';
import { formatTime } from '../utils/papers';
import { LoadError } from './LoadError';
import { NoteEditor } from './NoteEditor';
import { ReadingNoteEditor } from './ReadingNoteEditor';
import { MarkdownView } from './MarkdownView';
import { appendUnderstanding, emptyReadingFields, parseReadingNote, withNoteSource, type NoteDraftRequest, type NoteSource, type ReadingFields } from '../utils/readingNotes';
import { ReadingExcerpt } from './ReadingExcerpt';

export interface NotesPanelProps {
  paperId: number; compact?: boolean; createRequest?: number; onCreateHandled?: () => void; hideCreate?: boolean; refreshVersion?: number;
  sourceFileId?: number; currentPage?: number; onJump?: (page: number) => void; onChanged?: () => void;
  draftRequest?: NoteDraftRequest; onDraftHandled?: (accepted: boolean) => void;
  onEditorStateChange?: (active: boolean, saving: boolean) => void;
  onExplain?: (source: NoteSource, excerpt: string) => void; explaining?: boolean;
}
interface Editor { note: Note | null; fields?: ReadingFields; source?: NoteSource; token: number }

export function NotesPanel({ paperId, compact = false, createRequest = 0, onCreateHandled, hideCreate = false, refreshVersion = 0, sourceFileId, currentPage, onJump, onChanged, draftRequest, onDraftHandled, onEditorStateChange, onExplain, explaining }: NotesPanelProps) {
  const { message, modal } = App.useApp();
  const load = useCallback((signal: AbortSignal) => api.notes.list(paperId, signal), [paperId, refreshVersion]);
  const { data, error, loading, reload } = useResource(load);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [expandedBookmarks, setExpandedBookmarks] = useState<Set<number>>(new Set());
  const requestToken = useRef<number | undefined>(undefined);
  const editorToken = useRef(0);
  const draftContainer = useRef<HTMLDivElement>(null);

  function startEditor(note: Note | null) {
    if (editor) { message.info('请先保存或取消当前笔记，再编辑另一条。'); return; }
    const parsed = note ? parseReadingNote(note.content) : { fields: emptyReadingFields(), source: undefined };
    setEditor({ note, fields: parsed.fields, source: parsed.source, token: ++editorToken.current });
  }
  useEffect(() => { if (createRequest) { startEditor(null); onCreateHandled?.(); } }, [createRequest]);
  useEffect(() => {
    if (!draftRequest || requestToken.current === draftRequest.token) return;
    requestToken.current = draftRequest.token;
    if (editorSaving) { message.info('正在保存笔记，请稍后再试。'); onDraftHandled?.(false); return; }
    if (editor) {
      if (draftRequest.explanation && editor.fields && editor.source?.fileId === draftRequest.source.fileId && editor.source.page === draftRequest.source.page && editor.fields.excerpt === draftRequest.excerpt) {
        setEditor({ ...editor, fields: { ...editor.fields, understanding: appendUnderstanding(editor.fields.understanding, draftRequest.explanation) } });
        message.success('已加入当前草稿的“我的理解”，保存后生效'); onDraftHandled?.(true);
      } else { message.info('当前已有未保存的笔记，请先保存或取消；现有内容已保留。'); onDraftHandled?.(false); }
      return;
    }
    setEditor({ note: null, source: draftRequest.source, token: ++editorToken.current, fields: { ...emptyReadingFields(), excerpt: draftRequest.excerpt, understanding: draftRequest.explanation ?? '' } });
    onDraftHandled?.(true);
  }, [draftRequest, editor, editorSaving, message, onDraftHandled]);
  useEffect(() => { onEditorStateChange?.(!!editor, editorSaving); }, [!!editor, editorSaving, onEditorStateChange]);
  useEffect(() => {
    if (!editor?.fields || !draftContainer.current) return;
    const parent = compact ? draftContainer.current.closest('.reader-notes') : null;
    if (parent) parent.scrollTop += draftContainer.current.getBoundingClientRect().top - parent.getBoundingClientRect().top;
    else draftContainer.current.scrollIntoView({ block: 'nearest' });
  }, [editor?.token]);
  useEffect(() => {
    if (!editor) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [!!editor]);

  function cancelEditor() {
    if (editorSaving) return;
    modal.confirm({ title: '放弃尚未保存的编辑？', content: '已保存的笔记不会改变。', okText: '放弃编辑', cancelText: '继续编辑', onOk: () => setEditor(null) });
  }
  async function remove(id: number) {
    if (deleting !== null) return;
    setDeleting(id);
    try { await api.notes.delete(id); message.success('笔记已删除'); reload(); onChanged?.(); }
    catch (reason) { message.error(errorMessage(reason)); }
    finally { setDeleting(null); }
  }
  function confirmRemove(id: number) {
    modal.confirm({ title: '删除这条笔记？', content: '此操作无法撤销。', okText: '确认删除', cancelText: '取消', okButtonProps: { danger: true }, onOk: () => remove(id) });
  }
  async function save(content: string) {
    const finalContent = editor?.fields ? content : withNoteSource(content, editor?.source);
    if (editor?.note) await api.notes.update(editor.note.id, finalContent);
    else await api.notes.create(paperId, finalContent);
    message.success('笔记已保存'); setEditor(null); reload(); onChanged?.();
  }

  return <section className={`notes-section bookmark-notes ${compact ? 'compact-notes' : ''}`} aria-label="阅读笔记">
    <div className="section-heading"><p className="section-description">{compact ? '随读随记' : '阅读与思考'}{data?.length ? ` · ${data.length} 条笔记` : ''}</p>
      <Space><Button type="text" size="small" onClick={reload} loading={loading}>刷新</Button>
        {!hideCreate && <Button type="primary" onClick={() => startEditor(null)} disabled={!!editor || deleting !== null}>新建笔记</Button>}</Space>
    </div>
    {editor?.fields && <div ref={draftContainer}><ReadingNoteEditor key={editor.token} value={editor.fields} source={editor.source} editing={!!editor.note}
      onChange={fields => setEditor(current => current ? { ...current, fields } : current)} onSave={save} onCancel={cancelEditor} onSavingChange={setEditorSaving}
      onExplain={editor.source?.fileId === sourceFileId && onExplain ? () => onExplain(editor.source!, editor.fields!.excerpt) : undefined} explaining={explaining} /></div>}
    {loading ? <Skeleton active /> : error ? <LoadError error={error} retry={reload} /> : data?.length ?
      <div className="note-list">{data.map(note => {
        const { source, body, fields } = parseReadingNote(note.content);
        const canJump = source?.fileId === sourceFileId && !!onJump;
        return <article key={note.id} className={`reading-entry bookmark-note${expandedBookmarks.has(note.id) ? ' bookmark-open' : ''}${canJump && source?.page === currentPage ? ' current-page-note' : ''}`} aria-label={`阅读笔记${source ? ` P.${source.page}` : ''}`}>
          <header className="reading-entry-heading">
            {source ? (canJump ? <button className="note-page-link bookmark-ribbon" title="跳回原文" onClick={() => onJump?.(source.page)}>P.{source.page}</button> : <span className="bookmark-ribbon">P.{source.page}</span>) : <span className="bookmark-ribbon manual-ribbon">记</span>}
            <span className="note-chapter">{fields?.chapter || (source ? '阅读摘录' : '手动笔记')}</span>
            <Dropdown trigger={['click']} menu={{ items: [{ key: 'edit', label: '编辑笔记' }, { key: 'delete', label: '删除笔记', danger: true }], onClick: ({ key }) => key === 'edit' ? startEditor(note) : confirmRemove(note.id) }}>
              <Button className="note-more" type="text" size="small" aria-label="笔记更多操作" disabled={deleting !== null || !!editor}>···</Button>
            </Dropdown>
          </header>
          <div className="reading-entry-thought" aria-label="我的理解"><MarkdownView content={fields ? fields.understanding || '*尚未补充理解*' : body} /></div>
          {expandedBookmarks.has(note.id) && fields?.excerpt && <ReadingExcerpt content={fields.excerpt} />}
          <footer className="reading-entry-footer">
            <div className="reading-entry-meta">{fields?.tags.map(tag => <span key={tag}>#{tag}</span>)}<time>{formatTime(note.updated_at)}</time></div>
            {source && (canJump ? <button className="note-original-link" onClick={() => onJump?.(source.page)}>查看原文 ↗</button> : <span>原附件不可定位</span>)}
          </footer>
          <button className="bookmark-expand" aria-expanded={expandedBookmarks.has(note.id)} onClick={() => setExpandedBookmarks(current => { const next = new Set(current); if (next.has(note.id)) next.delete(note.id); else next.add(note.id); return next; })}>{expandedBookmarks.has(note.id) ? '收起书签' : '展开笔记'}</button>
        </article>;

      })}</div> : !editor && <Card><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有笔记，可以摘录原文或手动记录想法。" /></Card>}
    {editor && !editor.fields && <NoteEditor note={editor.note ? { ...editor.note, content: parseReadingNote(editor.note.content).body } : null} onSave={save} onClose={() => setEditor(null)} onSavingChange={setEditorSaving} />}
  </section>;
}
