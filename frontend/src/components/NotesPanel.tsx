import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Dropdown, Empty, Input, Select, Segmented, Skeleton, Space } from 'antd';
import { api, errorMessage } from '../api/client';
import { useResource } from '../hooks/useResource';
import { useNoteDrafts } from '../hooks/useNoteDrafts';
import type { Note } from '../types/api';
import { formatTime } from '../utils/papers';
import { dirtyDraft, type NoteDraft } from '../utils/noteDrafts';
import { LoadError } from './LoadError';
import { NoteEditor } from './NoteEditor';
import { ReadingNoteEditor } from './ReadingNoteEditor';
import { MarkdownView } from './MarkdownView';
import { appendExcerpt, emptyReadingFields, noteExcerpts, noteSources, parseReadingNote, serializeReadingNote, withNoteSource, type HighlightRect, type NoteDraftRequest, type NoteSource } from '../utils/readingNotes';
import { ReadingExcerpt } from './ReadingExcerpt';

export interface NotesPanelProps {
  paperId: number; compact?: boolean; createRequest?: number; onCreateHandled?: () => void; hideCreate?: boolean; refreshVersion?: number;
  sourceFileId?: number; currentPage?: number; totalPages?: number; onJump?: (page: number, rects?: HighlightRect[]) => void; onChanged?: () => void;
  draftRequest?: NoteDraftRequest; onDraftHandled?: (accepted: boolean) => void;
  onEditorStateChange?: (active: boolean, saving: boolean) => void;
  onExplain?: (source: NoteSource, excerpt: string) => void; explaining?: boolean;
}

export function NotesPanel({ paperId, compact = false, createRequest = 0, onCreateHandled, hideCreate = false, refreshVersion = 0, sourceFileId, currentPage, totalPages, onJump, onChanged, draftRequest, onDraftHandled, onEditorStateChange, onExplain, explaining }: NotesPanelProps) {
  const { message, modal } = App.useApp();
  const { data, error, loading, reload } = useResource(useCallback((signal: AbortSignal) => api.notes.list(paperId, signal), [paperId, refreshVersion]));
  const drafts = useNoteDrafts(paperId);
  const editor = drafts.drafts.find(item => item.id === drafts.activeId);
  const [editorSaving, setEditorSaving] = useState(false), [deleting, setDeleting] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState(''), [scope, setScope] = useState('all'), [sort, setSort] = useState('updated');
  const requestToken = useRef<number | undefined>(undefined), createToken = useRef(0);
  const draftContainer = useRef<HTMLDivElement>(null);
  function putEditor(next: NoteDraft) {
    drafts.change(state => ({ ...state, activeId: next.id, drafts: [...state.drafts.filter(item => item.id !== next.id && (item.id !== state.activeId || dirtyDraft(item))), next] }));
  }
  function updateEditor(patch: Partial<NoteDraft>) {
    if (!editor) return;
    drafts.change(state => ({ ...state, drafts: state.drafts.map(item => item.id === editor.id ? { ...item, ...patch, updatedAt: Date.now() } : item) }));
  }
  function startEditor(note: Note | null) {
    if (editorSaving) return;
    const existing = note && drafts.drafts.find(item => item.note?.id === note.id);
    if (existing) { drafts.change(state => ({ ...state, activeId: existing.id })); return; }
    const parsed = note ? parseReadingNote(note.content) : { fields: emptyReadingFields(), source: sourceFileId && currentPage ? { fileId: sourceFileId, page: currentPage, kind: 'manual' as const } : undefined, body: '' };
    const baseline = parsed.fields ? serializeReadingNote(parsed.fields, parsed.source) : parsed.body;
    putEditor({ id: note ? `note-${note.id}` : `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, note, fields: parsed.fields, source: parsed.source, body: parsed.body, baseline, updatedAt: Date.now() });
  }
  useEffect(() => { if (!createRequest) { createToken.current = 0; return; } if (createRequest !== createToken.current) { createToken.current = createRequest; startEditor(null); onCreateHandled?.(); } }, [createRequest]);
  useEffect(() => {
    if (!draftRequest || requestToken.current === draftRequest.token) return;
    requestToken.current = draftRequest.token;
    if (editorSaving) { message.info('正在保存笔记，请稍后再试。'); onDraftHandled?.(false); return; }
    if (editor && !draftRequest.separate) {
      if (editor.fields) {
        if (noteExcerpts(editor.fields, editor.source).length >= 200) { message.info('单条笔记最多保留 200 段摘录，请另建笔记。'); onDraftHandled?.(false); return; }
        const result = appendExcerpt(editor.fields, editor.source, draftRequest); updateEditor({ fields: result.fields });
        message.success(draftRequest.explanation ? '解释已加入当前草稿' : result.added ? '摘录已加入当前草稿' : '这段原文已在当前草稿中');
      } else {
        updateEditor({ fields: appendExcerpt({ ...emptyReadingFields(), understanding: editor.body }, editor.source, draftRequest).fields });
        message.success('摘录已加入草稿，原 Markdown 内容保留在“我的理解”中');
      }
    } else {
      const fields = appendExcerpt(emptyReadingFields(), undefined, draftRequest).fields;
      putEditor({ id: `new-${Date.now()}-${draftRequest.token}`, note: null, fields, source: draftRequest.source, body: '', baseline: serializeReadingNote(emptyReadingFields(), draftRequest.source), updatedAt: Date.now() });
    }
    onDraftHandled?.(true);
  }, [draftRequest, editorSaving]);
  useEffect(() => { onEditorStateChange?.(!!editor, editorSaving); }, [!!editor, editorSaving, onEditorStateChange]);
  useEffect(() => {
    if (!editor?.fields || !draftContainer.current) return;
    const parent = compact ? draftContainer.current.closest('.reader-notes') : null;
    if (parent) parent.scrollTop += draftContainer.current.getBoundingClientRect().top - parent.getBoundingClientRect().top;
    else draftContainer.current.scrollIntoView({ block: 'nearest' });
  }, [editor?.id]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (drafts.storageError && drafts.drafts.some(dirtyDraft)) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [drafts.storageError, drafts.drafts]);
  function discard(id: string) {
    const target = drafts.drafts.find(item => item.id === id);
    const remove = () => drafts.change(state => ({ ...state, activeId: state.activeId === id ? null : state.activeId, drafts: state.drafts.filter(item => item.id !== id) }));
    if (target && dirtyDraft(target)) modal.confirm({ title: '放弃这份草稿？', content: '已保存的笔记不受影响。', okText: '放弃草稿', cancelText: '保留草稿', onOk: remove }); else remove();
  }
  function collapseEditor() {
    if (editorSaving) return;
    drafts.change(state => ({ ...state, activeId: null, drafts: state.drafts.filter(item => item.id !== editor?.id || dirtyDraft(item)) }));
  }
  async function remove(id: number) {
    if (deleting !== null) return; setDeleting(id);
    try { await api.notes.delete(id); drafts.change(state => ({ ...state, activeId: state.activeId === `note-${id}` ? null : state.activeId, drafts: state.drafts.filter(item => item.note?.id !== id) })); message.success('笔记已删除'); reload(); onChanged?.(); }
    catch (reason) { message.error(errorMessage(reason)); } finally { setDeleting(null); }
  }
  async function save(content: string) {
    if (!editor) return;
    const finalContent = editor.fields ? content : withNoteSource(content, editor.source);
    if (editor.note) await api.notes.update(editor.note.id, finalContent); else await api.notes.create(paperId, finalContent);
    drafts.change(state => ({ ...state, activeId: state.activeId === editor.id ? null : state.activeId, drafts: state.drafts.filter(item => item.id !== editor.id) }));
    message.success('笔记已保存'); reload(); onChanged?.();
  }
  const rows = (data ?? []).map(note => ({ note, ...parseReadingNote(note.content) }));
  const visible = rows.filter(row => (scope !== 'current' || noteSources(row.fields, row.source).some(source => source.fileId === sourceFileId && source.page === currentPage)) && (!search.trim() || `${row.body} ${noteSources(row.fields, row.source).map(s => `P.${s.page}`).join(' ')}`.toLowerCase().includes(search.trim().toLowerCase()))).sort((a, b) => sort === 'page' ? (noteSources(a.fields, a.source).find(s => s.fileId === sourceFileId)?.page ?? Infinity) - (noteSources(b.fields, b.source).find(s => s.fileId === sourceFileId)?.page ?? Infinity) || b.note.id - a.note.id : b.note.updated_at.localeCompare(a.note.updated_at) || b.note.id - a.note.id);
  const retained = drafts.drafts.filter(dirtyDraft);
  return <section className={`notes-section bookmark-notes ${compact ? 'compact-notes' : ''}`} aria-label="阅读笔记">
    <div className="section-heading"><p className="section-description">{compact ? '随读随记' : '阅读与思考'} · {data?.length ?? 0} 条笔记</p><Space><Button type="text" size="small" onClick={reload} loading={loading}>刷新</Button>{!hideCreate && <Button type="primary" onClick={() => startEditor(null)} disabled={editorSaving || deleting !== null}>{editor ? '另建笔记' : '新建笔记'}</Button>}</Space></div>
    {drafts.storageError && <Alert type="warning" title="本机草稿保存失败，请先保存笔记再离开。" />}
    {retained.length > 0 && <div className="draft-shelf" aria-label="本机草稿"><span>本机草稿 · {retained.length}</span>{retained.map(item => <Space key={item.id} size={0}><Button type={item.id === editor?.id ? 'primary' : 'text'} size="small" disabled={editorSaving} onClick={() => drafts.change(state => ({ ...state, activeId: item.id }))}>{item.note ? '编辑草稿' : '新笔记'}{item.source ? ` P.${item.source.page}` : ''}{item.id !== editor?.id ? ' · 恢复' : ''}</Button><Button type="text" size="small" aria-label="放弃草稿" disabled={editorSaving} onClick={() => discard(item.id)}>×</Button></Space>)}</div>}
    {editor?.fields && <div ref={draftContainer}><ReadingNoteEditor key={editor.id} value={editor.fields} source={editor.source} sourceFileId={sourceFileId} currentPage={currentPage} totalPages={totalPages} editing={!!editor.note} draftStatus={dirtyDraft(editor) ? drafts.storageError ? '草稿尚未保存' : '草稿已保存在本机' : '尚未修改'} onChange={fields => updateEditor({ fields })} onSourceChange={source => updateEditor({ source })} onSave={save} onCancel={collapseEditor} onSavingChange={setEditorSaving} onExplain={onExplain} explaining={explaining} /></div>}
    {rows.length > 0 && <div className="note-filters"><Input aria-label="搜索笔记" placeholder="搜索理解、摘录或页码…" allowClear value={search} onChange={event => setSearch(event.target.value)} /><Space wrap>{currentPage && <Segmented aria-label="笔记范围" size="small" value={scope} onChange={setScope} options={[{ label: '全部', value: 'all' }, { label: `当前页 P.${currentPage}`, value: 'current' }]} />}<Select aria-label="笔记排序" size="small" value={sort} onChange={setSort} options={[{ label: '最近更新', value: 'updated' }, { label: '原文页序', value: 'page' }]} /><span className="muted">{visible.length} 条</span></Space></div>}
    {loading && !data ? <Skeleton active /> : error ? <LoadError error={error} retry={reload} /> : visible.length ? <div className="note-list">{visible.map(({ note, source, body, fields }) => {
      const sources = noteSources(fields, source), first = sources[0], excerpts = noteExcerpts(fields, source);
      const canJump = first?.fileId === sourceFileId && !!onJump;
      const thought = fields ? fields.understanding || excerpts[0]?.text || '' : body;
      const canExpand = thought.length > 72 || thought.includes('\n') || excerpts.length > 0 || !!fields?.tags.length || !!fields?.chapter;
      const open = expanded.has(note.id);
      return <article key={note.id} className={`reading-entry bookmark-note${open ? ' bookmark-open' : ''}${!canExpand ? ' bookmark-short' : ''}${sources.some(item => item.fileId === sourceFileId && item.page === currentPage) ? ' current-page-note' : ''}`} aria-label={`阅读笔记${first ? ` P.${first.page}` : ''}`}>
        <header className="reading-entry-heading">{first ? canJump ? <button className="note-page-link bookmark-ribbon" title="跳回原文" onClick={() => onJump?.(first.page, first.rects)}>P.{first.page}</button> : <span className="bookmark-ribbon">P.{first.page}</span> : <span className="bookmark-ribbon manual-ribbon">全</span>}<span className="note-chapter">{sources.length > 1 ? sources.map(s => `P.${s.page}`).join(' · ') : first ? '阅读笔记' : '全文笔记'}</span><Dropdown trigger={['click']} menu={{ items: [{ key: 'edit', label: '编辑笔记' }, { key: 'delete', label: '删除笔记', danger: true }], onClick: ({ key }) => key === 'edit' ? startEditor(note) : modal.confirm({ title: '删除这条笔记？', content: '此操作无法撤销。', okText: '确认删除', cancelText: '取消', okButtonProps: { danger: true }, onOk: () => remove(note.id) }) }}><Button className="note-more" type="text" size="small" aria-label="笔记更多操作" disabled={deleting !== null || editorSaving}>···</Button></Dropdown></header>
        <div className="reading-entry-thought" aria-label="我的理解"><MarkdownView content={thought} /></div>
        {open && <>{fields?.chapter && <p className="muted">原章节：{fields.chapter}</p>}{excerpts.map((item, index) => <div key={index} className="saved-excerpt"><div className="excerpt-source-row"><span>{item.source ? `原文 · P.${item.source.page}` : '原文摘录'}</span>{item.source?.fileId === sourceFileId && onJump ? <button className="note-original-link" onClick={() => onJump(item.source!.page, item.source!.rects)}>查看这段原文 ↗</button> : item.source && <span>原文件已替换，需重新关联</span>}</div><ReadingExcerpt content={item.text} /></div>)}</>}
        <footer className="reading-entry-footer"><div className="reading-entry-meta">{fields?.tags.map(tag => <span key={tag}>#{tag}</span>)}<time>{formatTime(note.updated_at)}</time></div>{first && (canJump ? <button className="note-original-link" onClick={() => onJump?.(first.page, first.rects)}>查看原文 ↗</button> : <span>原文件已替换，需重新关联</span>)}</footer>
        {canExpand && <button className="bookmark-expand" aria-expanded={open} onClick={() => setExpanded(current => { const next = new Set(current); if (next.has(note.id)) next.delete(note.id); else next.add(note.id); return next; })}>{open ? '收起笔记' : '展开笔记 …'}</button>}
      </article>;
    })}</div> : !editor && <Card><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={rows.length ? '没有符合条件的笔记，试试其他关键词或查看全部。' : '还没有笔记，可以摘录原文或记录想法。'} /></Card>}
    {editor && !editor.fields && <NoteEditor key={editor.id} note={editor.note} value={editor.body} onChange={body => updateEditor({ body })} onSave={save} onClose={collapseEditor} onSavingChange={setEditorSaving} draftStatus={drafts.storageError ? '草稿保存失败' : dirtyDraft(editor) ? '草稿已保存在本机' : '尚未修改'} />}
  </section>;
}
