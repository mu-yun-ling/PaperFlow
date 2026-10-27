import { useEffect, useRef, useState, type RefObject } from 'react';
import { Button } from 'antd';
import { TextLayer, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import type { PdfSelection } from './PdfReader';
import type { NoteSource } from '../utils/readingNotes';
import { PdfMarkupLayer } from './PdfMarkupLayer';
import type { AnnotationStore, MarkupTool } from '../types/annotations';

export function PdfPageSurface({ pdf, page, width, height, root, highlights, onSelection, annotations, tool = 'read', color = '#cf654f' }: {
  pdf: PDFDocumentProxy; page: number; width: number; height: number; root: RefObject<HTMLDivElement | null>;
  highlights: NoteSource[]; onSelection: (selection: PdfSelection | null) => void;
  annotations?: AnnotationStore; tool?: MarkupTool; color?: string;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { root: root.current, rootMargin: '900px 0px' });
    if (sheet.current) observer.observe(sheet.current);
    return () => observer.disconnect();
  }, [root]);
  useEffect(() => {
    if (!near) return;
    let disposed = false;
    let render: RenderTask | undefined;
    let layer: TextLayer | undefined;
    setReady(false); setError('');
    const timeout = window.setTimeout(() => {
      disposed = true; render?.cancel(); layer?.cancel(); setError('本页加载超时');
    }, 30000);
    void pdf.getPage(page).then(async item => {
      if (disposed || !canvas.current || !text.current) return;
      const scale = width / item.getViewport({ scale: 1 }).width;
      // Bound each canvas to avoid excessive GPU memory on oversized pages.
      const density = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(12_000_000 / (width * height)));
      const viewport = item.getViewport({ scale: scale * density });
      canvas.current.width = Math.ceil(viewport.width); canvas.current.height = Math.ceil(viewport.height);
      render = item.render({ canvas: canvas.current, viewport }); await render.promise;
      if (disposed || !text.current) return;
      text.current.style.setProperty('--total-scale-factor', String(scale));
      layer = new TextLayer({ container: text.current, viewport: item.getViewport({ scale }), textContentSource: item.streamTextContent() });
      await layer.render();
      if (!disposed) { clearTimeout(timeout); setReady(true); }
    }).catch(reason => {
      if (!disposed && reason?.name !== 'RenderingCancelledException') { clearTimeout(timeout); setError('本页加载失败'); }
    });
    return () => { disposed = true; clearTimeout(timeout); render?.cancel(); layer?.cancel(); };
  }, [pdf, page, near, width, height, retry]);

  function capture() {
    if (tool !== 'read' && tool !== 'highlight') return;
    const selected = window.getSelection(), container = text.current;
    if (!selected || !container || selected.isCollapsed || !container.contains(selected.anchorNode) || !container.contains(selected.focusNode)) { onSelection(null); return; }
    const value = selected.toString().trim().slice(0, 8000);
    if (!value) { onSelection(null); return; }
    const bounds = container.getBoundingClientRect();
    const rects = [...selected.getRangeAt(0).getClientRects()].filter(r => r.width > 0 && r.height > 0).slice(0, 200).map(r => {
      const x = Math.max(0, (r.left - bounds.left) / bounds.width), y = Math.max(0, (r.top - bounds.top) / bounds.height);
      return { x, y, width: Math.max(0, Math.min(r.width / bounds.width, 1 - x)), height: Math.max(0, Math.min(r.height / bounds.height, 1 - y)) };
    });
    onSelection({ text: value, page, rects });
  }
  return <div ref={sheet} className="pdf-sheet continuous-page" data-pdf-page={page} style={{ width, height }} onPointerUp={capture} onKeyUp={capture}>
    {near && <div key={`${width}-${retry}`} className="pdf-page-render">
      <canvas ref={canvas} style={{ width, height }} role="img" aria-label={`PDF 第 ${page} 页`} />
      <div ref={text} className="textLayer" />
    </div>}
    {(!near || !ready) && !error && <span className="pdf-page-placeholder">第 {page} 页{near ? ' · 正在渲染…' : ''}</span>}
    {error && <div className="pdf-page-error">{error}<Button size="small" onClick={() => setRetry(n => n + 1)}>重试本页</Button></div>}
    <div className="pdf-highlights">{highlights.filter(source => source.page === page).flatMap((source, i) => (source.rects ?? []).map((r, j) => <span key={`${i}-${j}`} className="pdf-highlight" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.width * 100}%`, height: `${r.height * 100}%` }} />))}</div>
    <span className="pdf-page-number" aria-hidden="true">{page}</span>
    {annotations && <PdfMarkupLayer page={page} width={width} height={height} store={annotations} tool={tool} color={color} />}
  </div>;
}
