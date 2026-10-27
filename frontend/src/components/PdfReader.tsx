import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, InputNumber, Segmented, Space, Spin } from 'antd';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Icon } from './Icon';
import { PdfThumbnail } from './PdfThumbnail';
import { PdfPageSurface } from './PdfPageSurface';
import { pageAtOffset, pdfLayout, storedOffset, type PageSize } from '../utils/pdfLayout';
import type { HighlightRect, NoteSource } from '../utils/readingNotes';
import type { AnnotationStore, MarkupTool } from '../types/annotations';
import { errorMessage } from '../api/client';

GlobalWorkerOptions.workerSrc = workerUrl;
export interface ReadingEvent { total_pages: number; current_page: number; read: boolean }
export interface PdfSelection { text: string; page: number; rects: HighlightRect[] }
export default function PdfReader({ blob, initialPage = 1, onProgress, thumbnails = false, jumpTo, highlights = [], onSelectionAction, selectionBusy = false, onPageChange, positionKey, restoreOffset = true, annotations }: {
  blob: Blob; initialPage?: number; onProgress?: (event: ReadingEvent) => void;
  thumbnails?: boolean; jumpTo?: { page: number; token: number }; highlights?: NoteSource[];
  onSelectionAction?: (action: 'excerpt' | 'highlight' | 'explain', selection: PdfSelection) => void; selectionBusy?: boolean;
  onPageChange?: (page: number) => void; positionKey?: string; restoreOffset?: boolean;
  annotations?: AnnotationStore;
}) {
  const { message } = App.useApp();
  const [tool, setTool] = useState<MarkupTool>('read');
  const [color, setColor] = useState('#cf654f');
  async function highlightSelection(selected: PdfSelection) {
    if (!annotations || annotations.saving || annotations.loading || annotations.error) return;
    try { await annotations.create({ page: selected.page, kind: 'highlight', color: tool === 'highlight' ? color : '#e8b931', geometry: { rects: selected.rects }, text: selected.text.slice(0, 2000) }); setSelection(null); window.getSelection()?.removeAllRanges(); }
    catch (reason) { message.error(`高亮未保存：${errorMessage(reason)}`); }
  }
  function captureSelection(selected: PdfSelection | null) {
    setSelection(selected);
    if (selected && tool === 'highlight') void highlightSelection(selected);
  }
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [page, setPage] = useState(initialPage);
  const [pageInput, setPageInput] = useState<number | null>(initialPage);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [showThumbnails, setShowThumbnails] = useState(thumbnails);
  const [selection, setSelection] = useState<PdfSelection | null>(null);
  const [width, setWidth] = useState(800);
  const viewport = useRef<HTMLDivElement>(null);
  const anchor = useRef({ page: initialPage, offset: 0 });
  const report = useRef(onProgress); report.current = onProgress;
  const pageChanged = useRef(onPageChange); pageChanged.current = onPageChange;
  const scrollGesture = useRef(false), restoring = useRef(false);
  const credited = useRef(new Set<number>());
  const usedJump = useRef<number | undefined>(undefined);
  const boxes = useMemo(() => pdfLayout(sizes, width * scale), [sizes, width, scale]);
  const storageKey = positionKey ? `paperflow-pdf-position:${positionKey}` : undefined;
  const padding = () => viewport.current ? parseFloat(getComputedStyle(viewport.current).paddingTop) || 0 : 0;
  function persist() {
    if (storageKey) try { localStorage.setItem(storageKey, JSON.stringify(anchor.current)); } catch { /* Private storage may be unavailable. */ }
  }
  function updatePage(next: number, read: boolean) {
    const changed = anchor.current.page !== next;
    anchor.current.page = next; setPage(next); setPageInput(next);
    if (changed) { setSelection(null); pageChanged.current?.(next); }
    if (document && (changed || (read && !credited.current.has(next)))) {
      if (read) credited.current.add(next);
      report.current?.({ total_pages: document.numPages, current_page: next, read });
    }
  }
  function goToPage(value: number) {
    if (!document || !viewport.current || !boxes.length) return;
    const next = Math.max(1, Math.min(document.numPages, Math.round(value)));
    scrollGesture.current = true;
    updatePage(next, true); anchor.current.offset = 0;
    viewport.current.scrollTop = padding() + boxes[next - 1].top; persist();
  }
  function syncScroll() {
    const element = viewport.current;
    if (!element || !boxes.length || restoring.current) return;
    const top = element.scrollTop - padding();
    const next = pageAtOffset(boxes, top + Math.min(element.clientHeight * .25, 120));
    updatePage(next, scrollGesture.current);
    anchor.current.offset = (top - boxes[next - 1].top) / boxes[next - 1].height; persist();
  }
  useEffect(() => {
    let disposed = false;
    let task: ReturnType<typeof getDocument> | undefined;
    setDocument(undefined); setSizes([]); setLoading(true); setError(''); setSelection(null);
    scrollGesture.current = false; credited.current.clear();
    const timeout = window.setTimeout(() => {
      disposed = true; void task?.destroy().catch(() => undefined);
      setLoading(false); setError('PDF 加载超时，请重试预览，或下载原文后打开。');
    }, 30000);
    void (async () => {
      const buffer = await blob.arrayBuffer(); if (disposed) return;
      task = getDocument({ data: new Uint8Array(buffer), cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/' });
      const pdf = await task.promise;
      // Stable placeholders preserve position while distant canvases are unloaded.
      const dimensions: PageSize[] = new Array(pdf.numPages);
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(4, pdf.numPages) }, async () => {
        while (cursor < pdf.numPages && !disposed) {
          const index = cursor++; const item = await pdf.getPage(index + 1);
          const view = item.getViewport({ scale: 1 }); dimensions[index] = { width: view.width, height: view.height };
        }
      }));
      if (disposed) return;
      const restored = Math.min(pdf.numPages, Math.max(1, anchor.current.page));
      let offset = 0;
      if (storageKey && restoreOffset) try { offset = storedOffset(localStorage.getItem(storageKey), restored); } catch { /* Page restore still works. */ }
      anchor.current = { page: restored, offset };
      clearTimeout(timeout); setDocument(pdf); setSizes(dimensions); setPage(restored); setPageInput(restored); setLoading(false);
      pageChanged.current?.(restored); report.current?.({ total_pages: pdf.numPages, current_page: restored, read: false });
    })().catch((reason: unknown) => {
      if (disposed) return;
      clearTimeout(timeout); setLoading(false);
      setError(reason instanceof Error && reason.name === 'PasswordException' ? '这份 PDF 有密码保护，请下载后使用本地阅读器打开。' : 'PDF 加载失败，请重试预览或检查原文件。');
    });
    return () => { disposed = true; clearTimeout(timeout); void task?.destroy().catch(() => undefined); };
  }, [blob, retry]);
  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(120, entry.contentRect.width)));
    observer.observe(viewport.current); return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if (!viewport.current || !boxes.length) return;
    restoring.current = true;
    const box = boxes[anchor.current.page - 1];
    viewport.current.scrollTop = padding() + box.top + anchor.current.offset * box.height;
    setSelection(null);
    const frame = requestAnimationFrame(() => { restoring.current = false; });
    return () => cancelAnimationFrame(frame);
  }, [boxes]);
  useEffect(() => {
    if (!jumpTo || usedJump.current === jumpTo.token || !document || loading) return;
    usedJump.current = jumpTo.token; goToPage(jumpTo.page);
  }, [jumpTo, document, loading]);
  return <div className={`pdf-reader pdf-layout continuous-reader${showThumbnails ? ' has-thumbnails' : ''}`}>
    {showThumbnails && <aside className="pdf-thumbnails" aria-label="PDF 页面缩略图"><div className="thumbnail-heading">目录</div>{document && sizes.map((_, index) => <PdfThumbnail key={`${retry}-${index}`} pdf={document} page={index + 1} active={page === index + 1} onClick={() => goToPage(index + 1)} />)}</aside>}
    <div className="pdf-main">
      <div className="pdf-controls"><Space wrap>
        {thumbnails && <Button aria-label="切换页面缩略图" title="页面缩略图" aria-pressed={showThumbnails} icon={<Icon name="panel" size={14} />} onClick={() => setShowThumbnails(!showThumbnails)} />}
        <InputNumber aria-label="PDF 页码" title="输入页码后按回车跳转" min={1} max={document?.numPages ?? 1} value={pageInput} precision={0} controls={false}
          disabled={!document || loading} onChange={setPageInput} onBlur={() => goToPage(pageInput ?? page)} onPressEnter={() => goToPage(pageInput ?? page)} />
        <span className="pdf-page-count">/ {document?.numPages ?? '—'}</span>
        <Button aria-label="缩小" title="缩小" disabled={scale <= .5} onClick={() => setScale(Math.max(.5, scale - .25))}>−</Button>
        <Button aria-label="适合宽度" title="恢复适合宽度" onClick={() => setScale(1)}>{Math.round(scale * 100)}%</Button>
        <Button aria-label="放大" title="放大" disabled={scale >= 2} onClick={() => setScale(Math.min(2, scale + .25))}>＋</Button>
        {onProgress && <Button title="将本页标记为已读" disabled={!document || loading} onClick={() => updatePage(page, true)} icon={<Icon name="check" size={13} />}>已读</Button>}
      </Space></div>
      {annotations && <div className="pdf-markup-toolbar" aria-label="PDF 标记工具">
        <Segmented size="small" aria-label="标记模式" value={tool} disabled={annotations.loading || annotations.saving || annotations.draft || !!annotations.error} onChange={value => { setTool(value as MarkupTool); setSelection(null); if (value === 'highlight') setColor('#e8b931'); }} options={[{ label: '选择', value: 'read' }, { label: '画笔', value: 'pen' }, { label: '高亮', value: 'highlight' }, { label: '文字', value: 'text' }, { label: '橡皮', value: 'erase' }]} />
        <div className="markup-colors" aria-label="标记颜色">{[['#cf654f', '珊瑚红'], ['#e8b931', '金黄'], ['#4d8063', '墨绿'], ['#527eb0', '蓝色']].map(([value, label]) => <button key={value} style={{ background: value }} aria-label={label} aria-pressed={color === value} disabled={annotations.saving || annotations.draft} onClick={() => setColor(value)} />)}</div>
        <span role="status">{annotations.loading ? '读取标记…' : annotations.saving ? '保存中…' : annotations.draft ? '批注尚未保存' : tool === 'pen' ? '拖动画线 · 自动保存' : tool === 'highlight' ? '选中文字即可高亮' : tool === 'text' ? '点击页面空白处插入文字' : tool === 'erase' ? '点击标记删除' : '标记已同步'}</span>
      </div>}
      {annotations?.error && <Alert type="warning" title={`标记读取失败：${annotations.error}`} action={<Button onClick={annotations.reload}>重新读取标记</Button>} />}
      {error && <Alert type="warning" showIcon title={error} action={<Button onClick={() => setRetry(n => n + 1)}>重试预览</Button>} />}
      <div className="pdf-canvas-viewport" ref={viewport} tabIndex={0} aria-label="PDF 阅读区域"
        onWheel={() => { scrollGesture.current = true; }} onTouchMove={() => { scrollGesture.current = true; }} onPointerDown={() => { scrollGesture.current = true; }}
        onKeyDown={event => { if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes(event.key)) scrollGesture.current = true; }} onScroll={syncScroll}>
        {loading && <div className="pdf-loading" role="status"><Spin /> 正在加载 PDF…</div>}
        {document && <div className="pdf-pages" style={{ width: width * scale }}>{boxes.map((box, index) => <PdfPageSurface key={`${retry}-${index}`} pdf={document} page={index + 1} width={width * scale} height={box.height} root={viewport} highlights={highlights} onSelection={captureSelection} annotations={annotations} tool={tool} color={color} />)}</div>}
      </div>
      {selection && onSelectionAction && <div className="selection-toolbar" role="toolbar" aria-label="选中文字操作" onPointerDown={event => event.preventDefault()}>
        <Button type="text" disabled={selectionBusy} onClick={() => onSelectionAction('excerpt', selection)}>摘录到笔记</Button><Button type="text" disabled={selectionBusy} onClick={() => onSelectionAction('explain', selection)}>AI 解释</Button><Button type="text" disabled={selectionBusy || annotations?.saving || annotations?.loading || !!annotations?.error} onClick={() => annotations ? void highlightSelection(selection) : onSelectionAction('highlight', selection)}>高亮</Button><Button type="text" aria-label="关闭选区操作" onClick={() => setSelection(null)}>×</Button>
      </div>}
    </div>
  </div>;
}
