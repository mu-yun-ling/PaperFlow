import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Modal, Progress, Segmented, Spin } from 'antd';
import { api, errorMessage } from '../api/client';
import type { Attachment } from '../types/api';
import type { PdfSelection, ReadingEvent } from './PdfReader';
import { ReaderNotes } from './ReaderNotes';
import { ReadingSplitPane, type ReadingLayout } from './ReadingSplitPane';
import { PreviewErrorBoundary } from './PreviewErrorBoundary';
import { Icon } from './Icon';
import { AIPanel } from './AIPanel';
import { MarkdownView } from './MarkdownView';
import { useNoteDrafts } from '../hooks/useNoteDrafts';
import { usePdfAnnotations } from '../hooks/usePdfAnnotations';
import { dirtyDraft } from '../utils/noteDrafts';
import { type HighlightRect, type NoteDraftRequest } from '../utils/readingNotes';

const PdfReader = lazy(() => import('./PdfReader'));

export function ReadingWorkspace({ file, blob, paperTitle, initialPage, initialRects, onClose, onDownload }: { file: Attachment; blob: Blob; paperTitle?: string; initialPage?: number; initialRects?: HighlightRect[]; onClose: () => void; onDownload: () => void }) {
  const { message } = App.useApp();
  const annotations = usePdfAnnotations(file.id);
  const drafts = useNoteDrafts(file.paper_id);
  const [layout, setLayout] = useState<ReadingLayout>(() => { try { const saved = localStorage.getItem('paperflow.reader.layout'); return saved === 'original' || saved === 'notes' ? saved : 'compare'; } catch { return 'compare'; } });
  const [notesTab, setNotesTab] = useState(() => { try { return localStorage.getItem('paperflow.reader.tab') === 'uploaded' ? 'uploaded' : 'online'; } catch { return 'online'; } });
  const [notesVersion, setNotesVersion] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage ?? file.reading_progress?.current_page ?? 1);
  const [jumpTo, setJumpTo] = useState<{ page: number; token: number; rects?: HighlightRect[] } | undefined>(() => initialRects?.length ? { page: initialPage ?? 1, rects: initialRects, token: Date.now() } : undefined);
  const documentRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (jumpTo && window.matchMedia('(max-width: 760px)').matches) documentRef.current?.scrollIntoView({ block: 'start' });
  }, [jumpTo]);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const selectionLock = useRef(false);
  const [explanation, setExplanation] = useState<{ markdown: string; selection: PdfSelection; added: boolean }>();
  const [draftRequest, setDraftRequest] = useState<NoteDraftRequest>();
  const draftToken = useRef(0);
  const [editorState, setEditorState] = useState({ active: false, saving: false });
  const editorStateChange = useCallback((active: boolean, saving: boolean) => setEditorState({ active, saving }), []);
  function requestDraft(selection: PdfSelection, explanation?: string, separate = false) {
    setDraftRequest({ token: ++draftToken.current, source: { fileId: file.id, page: selection.page, kind: 'excerpt', rects: selection.rects }, excerpt: selection.text, explanation, separate });
    if (layout === 'original') setLayout('compare');
    setNotesTab('online');
  }
  function draftHandled(accepted: boolean) {
    if (accepted && draftRequest?.explanation) setExplanation(current => current ? { ...current, added: true } : current);
    setDraftRequest(undefined);
  }
  function close() {
    if (annotations.saving) { message.info('正在保存 PDF 标记，请稍候'); return; }
    if (annotations.draft) { message.info('请先保存或取消 PDF 批注'); return; }
    if (pending || error || selectionBusy || editorState.saving) return;
    if (drafts.storageError && drafts.drafts.some(dirtyDraft)) { message.info('本机草稿尚未保存，请先保存笔记再关闭'); return; }
    onClose();
  }
  const [explanationError, setExplanationError] = useState('');
  const aiRequest = useRef<AbortController | null>(null);
  function refreshNotes() { setNotesVersion(value => value + 1); }
  function changeLayout(next: ReadingLayout) { setLayout(next); try { localStorage.setItem('paperflow.reader.layout', next); } catch { /* Reading remains available. */ } }
  function changeTab(next: string) { setNotesTab(next); try { localStorage.setItem('paperflow.reader.tab', next); } catch { /* Reading remains available. */ } }
  function jump(page: number, rects?: HighlightRect[]) { setJumpTo({ page, rects, token: Date.now() }); if (layout !== 'compare') setLayout('compare'); }
  useEffect(() => () => aiRequest.current?.abort(), []);
  async function selectionAction(action: 'excerpt' | 'excerpt-new' | 'highlight' | 'explain', selection: PdfSelection) {
    if (action === 'excerpt' || action === 'excerpt-new') { requestDraft(selection, undefined, action === 'excerpt-new'); return; }
    if (selectionLock.current) return;
    selectionLock.current = true; setSelectionBusy(true);
    if (layout === 'original') setLayout('compare');
    setNotesTab('online');
    try {
      if (action === 'explain') {
        setExplanation(undefined); setExplanationError('');
        const controller = new AbortController(); aiRequest.current = controller;
        const result = await api.ai.explain(file.paper_id, file.id, selection.page, selection.text, controller.signal);
        if (!controller.signal.aborted) setExplanation({ markdown: result.markdown, selection, added: false });
      } else {
        await annotations.create({ page: selection.page, kind: 'highlight', color: '#e8b931', text: selection.text.slice(0, 2000), geometry: { rects: selection.rects } });
      }
    } catch (reason) { if (action === 'explain' && !aiRequest.current?.signal.aborted) setExplanationError(errorMessage(reason)); else if (action !== 'explain') message.error(errorMessage(reason)); }
    finally { selectionLock.current = false; if (mounted.current) setSelectionBusy(false); }
  }
  const [progress, setProgress] = useState(file.reading_progress);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const queue = useRef<ReadingEvent[]>([]);
  const saving = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function flush() {
    if (saving.current) return;
    saving.current = true; setPending(true); setError('');
    try {
      while (queue.current.length) {
        const saved = await api.files.progress(file.id, queue.current[0]);
        queue.current.shift();
        if (mounted.current) setProgress(saved);
      }
    } catch (reason) { if (mounted.current) setError(`阅读位置尚未保存：${errorMessage(reason)}`); }
    finally { saving.current = false; if (mounted.current) setPending(false); }
  }

  function record(event: ReadingEvent) {
    queue.current.push(event);
    void flush();
  }

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (queue.current.length) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  return <Modal open className="reading-workspace" width="98vw" styles={{ body: { padding: 0 } }}
    title={<div className="reader-heading"><Button type="text" aria-label="返回文献" disabled={pending || !!error || selectionBusy || editorState.saving} onClick={close} icon={<Icon name="arrow" size={17} />} /><strong title={`${paperTitle || ''}\n${file.filename}`}>{paperTitle || file.filename}</strong><Segmented className="reader-layout-switch" aria-label="阅读布局" value={layout} onChange={changeLayout} options={[{ label: '专注原文', value: 'original' }, { label: '对照阅读', value: 'compare' }, { label: '专注笔记', value: 'notes' }]} /></div>}
    footer={null} onCancel={close} closable={!pending && !error && !selectionBusy && !editorState.saving} mask={{ closable: false }} keyboard={false}>
    <div className="reader-progress"><Progress percent={progress?.percent ?? 0} format={value => `${value}%`} size="small" />
      <span>{progress ? `已读至 ${progress.max_page} / ${progress.total_pages} 页` : '正在读取页数'} · {pending ? '正在保存…' : error ? '尚未同步' : '位置已同步'}</span><Button type="text" size="small" title="下载原始 PDF，不包含站内批注" onClick={onDownload} icon={<Icon name="download" size={13} />}>下载原文</Button></div>
    {error && <Alert type="warning" title={error} action={<Button size="small" onClick={() => void flush()}>重试保存</Button>}
      description={<Button type="text" size="small" onClick={onClose}>放弃未保存的位置并关闭</Button>} />}
    <ReadingSplitPane layout={layout} document={<section ref={documentRef} className="reader-document" aria-label="论文阅读器">
      <PreviewErrorBoundary><Suspense fallback={<div className="pdf-loading" role="status"><Spin /> 正在加载阅读器…</div>}><PdfReader annotations={annotations} blob={blob} initialPage={initialPage ?? file.reading_progress?.current_page ?? 1} onProgress={record} onPageChange={setCurrentPage} positionKey={String(file.id)} restoreOffset={initialPage === undefined} thumbnails jumpTo={jumpTo} onSelectionAction={selectionAction} hasDraft={editorState.active} selectionBusy={selectionBusy || editorState.saving} /></Suspense></PreviewErrorBoundary>
      <p className="reader-hint">选中文字即可摘录或高亮 · 点击 AI 解释会将所选片段发送到已配置的服务</p>
    </section>} notes={<aside className="reader-notes">
      {selectionBusy && <div className="muted" role="status"><Spin size="small" /> 正在处理所选片段…</div>}
      {explanationError && <Alert type="warning" title={explanationError} closable onClose={() => setExplanationError('')} />}
      {explanation && <section className="reader-explanation" aria-label="AI 片段解释"><h3>AI · P.{explanation.selection.page} 片段解释</h3><MarkdownView content={explanation.markdown} /><p className="muted">依据所选片段生成，请结合原文核对。加入后仍可修改，保存笔记才会生效。</p><Button size="small" type="primary" disabled={explanation.added || !!draftRequest || editorState.saving} onClick={() => requestDraft(explanation.selection, explanation.markdown)}>{explanation.added ? '已加入草稿' : '加入我的理解'}</Button><Button size="small" type="text" onClick={() => setExplanation(undefined)}>收起解释</Button></section>}
      <ReaderNotes paperId={file.paper_id} tab={notesTab} onTabChange={changeTab} sourceFileId={file.id} currentPage={currentPage} totalPages={progress?.total_pages} onJump={jump} refreshVersion={notesVersion} onChanged={refreshNotes} draftRequest={draftRequest} onDraftHandled={draftHandled} onEditorStateChange={editorStateChange} explaining={selectionBusy} onExplain={(source, text) => void selectionAction('explain', { page: source.page, text, rects: source.rects ?? [] })} />
      <details className="reader-auxiliary"><summary>✧ AI 辅助 · 分析、关键词与阅读总结</summary><AIPanel paperId={file.paper_id} onTagsChanged={() => undefined} onNoteSaved={refreshNotes} /></details>
    </aside>} />
  </Modal>;
}
