import { useEffect, useRef, useState } from 'react';
import { Alert, Button, InputNumber, Space, Spin } from 'antd';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = workerUrl;

export interface ReadingEvent { total_pages: number; current_page: number; read: boolean }

export default function PdfReader({ blob, initialPage = 1, onProgress }: {
  blob: Blob; initialPage?: number; onProgress?: (event: ReadingEvent) => void;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState<number | null>(initialPage);
  const [scale, setScale] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const startPage = useRef(initialPage);
  const report = useRef(onProgress);
  report.current = onProgress;
  const navigated = useRef(false);
  const credited = useRef(new Set<number>());
  const scrollGesture = useRef(false);
  useEffect(() => { setPageInput(page); }, [page]);

  function creditPage() {
    if (!document || loading || error || credited.current.has(page)) return;
    credited.current.add(page);
    report.current?.({ total_pages: document.numPages, current_page: page, read: true });
  }

  function goToPage(next: number) {
    if (!document || loading || next === page || next < 1 || next > document.numPages) return;
    navigated.current = true; scrollGesture.current = false; setPage(next);
  }

  useEffect(() => {
    let disposed = false;
    let task: ReturnType<typeof getDocument> | undefined;
    setDocument(undefined); setLoading(true); setError(''); scrollGesture.current = false;
    const timeout = window.setTimeout(() => {
      disposed = true; void task?.destroy().catch(() => undefined);
      setLoading(false); setError('PDF 加载超时，请重试预览，或下载原文后打开。');
    }, 30000);
    void blob.arrayBuffer().then((buffer) => {
      if (disposed) return;
      task = getDocument({ data: new Uint8Array(buffer), cMapUrl: '/pdfjs/cmaps/', cMapPacked: true,
        standardFontDataUrl: '/pdfjs/standard_fonts/', wasmUrl: '/pdfjs/wasm/' });
      return task.promise;
    }).then((pdf) => { if (!disposed && pdf) {
      const restored = Math.min(pdf.numPages, Math.max(1, startPage.current));
      window.clearTimeout(timeout); setDocument(pdf); setPage(restored);
      report.current?.({ total_pages: pdf.numPages, current_page: restored, read: false });
    } })
      .catch((reason: unknown) => { if (!disposed) {
        window.clearTimeout(timeout);
        const name = reason instanceof Error ? reason.name : '';
        setError(name === 'PasswordException' ? '这份 PDF 有密码保护，请下载后使用本地阅读器打开。'
          : name === 'InvalidPDFException' ? 'PDF 内容无法解析，请检查原文件或重新上传。'
          : 'PDF 阅读器加载失败，请重试预览。若仍失败，请确认本机服务正在运行，或下载原文后打开。');
        setLoading(false);
      } });
    return () => { disposed = true; window.clearTimeout(timeout); void task?.destroy().catch(() => undefined); };
  }, [blob, retry]);

  useEffect(() => {
    if (!viewport.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(200, entry.contentRect.width - 32)));
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!document) return;
    let disposed = false;
    let render: RenderTask | undefined;
    setLoading(true); setError(''); scrollGesture.current = false;
    const timeout = window.setTimeout(() => {
      disposed = true; render?.cancel(); setLoading(false); setError('本页渲染超时，请重试或下载原文。');
    }, 30000);
    void document.getPage(page).then(async (pdfPage) => {
      if (disposed || !canvas.current) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const cssScale = width / base.width * scale;
      const density = Math.min(window.devicePixelRatio || 1, 2);
      const view = pdfPage.getViewport({ scale: cssScale * density });
      const element = canvas.current;
      element.width = Math.floor(view.width); element.height = Math.floor(view.height);
      element.style.width = `${view.width / density}px`; element.style.height = `${view.height / density}px`;
      render = pdfPage.render({ canvas: element, viewport: view });
      await render.promise;
      if (!disposed) {
        window.clearTimeout(timeout);
        setLoading(false);
        if (navigated.current) {
          navigated.current = false; credited.current.add(page);
          if (viewport.current) viewport.current.scrollTop = 0;
          report.current?.({ total_pages: document.numPages, current_page: page, read: true });
        }
      }
    }).catch((reason) => {
      if (!disposed && reason?.name !== 'RenderingCancelledException') { window.clearTimeout(timeout); setError('本页渲染失败，请重试、尝试其他页面或下载文件。'); setLoading(false); }
    });
    return () => { disposed = true; window.clearTimeout(timeout); render?.cancel(); };
  }, [document, page, scale, width]);

  return <div className="pdf-reader">
    <div className="pdf-controls"><Space wrap>
      <Button disabled={!document || loading || page <= 1} onClick={() => goToPage(page - 1)}>上一页</Button>
      <InputNumber aria-label="PDF 页码" title="输入页码后按回车跳转" min={1} max={document?.numPages ?? 1} value={pageInput} precision={0} controls={false}
        disabled={!document || loading} onChange={setPageInput} onBlur={() => goToPage(pageInput ?? page)}
        onPressEnter={() => goToPage(pageInput ?? page)} />
      <span>/ {document?.numPages ?? '—'}</span>
      <Button disabled={!document || loading || page >= document.numPages} onClick={() => goToPage(page + 1)}>下一页</Button>
      <Button disabled={scale <= .5} onClick={() => setScale(Math.max(.5, scale - .25))}>缩小</Button>
      <Button disabled={scale >= 2} onClick={() => setScale(Math.min(2, scale + .25))}>放大</Button>
      <Button onClick={() => setScale(1)}>适合宽度</Button>
      {onProgress && <Button disabled={!document || loading || !!error} onClick={creditPage}>本页已读</Button>}
    </Space></div>
    {error && <Alert type="warning" showIcon title={error} action={<Button onClick={() => { startPage.current = page; setRetry(value => value + 1); }}>重试预览</Button>} />}
    <div className="pdf-canvas-viewport" ref={viewport} tabIndex={0} aria-label="PDF 阅读区域"
      onWheel={(event) => { if (event.deltaY > 0) { scrollGesture.current = true;
        const element = event.currentTarget; if (element.scrollTop + element.clientHeight >= element.scrollHeight - 8) creditPage(); } }}
      onTouchMove={() => { scrollGesture.current = true; }}
      onKeyDown={(event) => { if (['ArrowDown', 'PageDown', 'End', ' '].includes(event.key)) scrollGesture.current = true; }}
      onScroll={(event) => { const element = event.currentTarget;
        if (scrollGesture.current && element.scrollTop + element.clientHeight >= element.scrollHeight - 8) creditPage(); }}>
      {loading && <div className="pdf-loading" role="status"><Spin /> 正在加载 PDF…</div>}
      <canvas ref={canvas} role="img" aria-label={`PDF 第 ${page} 页`} style={{ visibility: error ? 'hidden' : 'visible' }} />
    </div>
  </div>;
}
