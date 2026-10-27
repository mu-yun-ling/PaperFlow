import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

export function PdfThumbnail({ pdf, page, active, onClick }: { pdf: PDFDocumentProxy; page: number; active: boolean; onClick: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: '150px' });
    if (button.current) observer.observe(button.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let disposed = false;
    let render: RenderTask | undefined;
    void pdf.getPage(page).then(async item => {
      if (disposed || !canvas.current) return;
      const viewport = item.getViewport({ scale: 96 / item.getViewport({ scale: 1 }).width });
      canvas.current.width = viewport.width; canvas.current.height = viewport.height;
      render = item.render({ canvas: canvas.current, viewport });
      await render.promise;
    }).catch(() => { /* 主阅读器独立显示文件错误；缩略图失败仍可点击页码。 */ });
    return () => { disposed = true; render?.cancel(); };
  }, [pdf, page, visible]);
  useEffect(() => {
    const element = button.current, parent = element?.parentElement;
    if (!active || !element || !parent) return;
    const item = element.getBoundingClientRect(), bounds = parent.getBoundingClientRect();
    if (item.top < bounds.top) parent.scrollTop += item.top - bounds.top;
    else if (item.bottom > bounds.bottom) parent.scrollTop += item.bottom - bounds.bottom;
  }, [active]);
  return <button ref={button} className="pdf-thumbnail" aria-label={`跳转第 ${page} 页`} aria-current={active ? 'page' : undefined} onClick={onClick}><canvas ref={canvas} width={96} height={130} /><span>{page}</span></button>;
}
