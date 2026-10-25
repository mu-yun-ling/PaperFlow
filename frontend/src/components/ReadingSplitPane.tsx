import { useRef, useState, type CSSProperties, type ReactNode } from 'react';

const preferenceKey = 'paperflow.reader.notesPercent';
const defaultPercent = 36;
function clamp(value: number) { return Math.min(60, Math.max(25, value)); }
function initialPercent() {
  try {
    const saved = localStorage.getItem(preferenceKey);
    const value = saved === null ? defaultPercent : Number(saved);
    return Number.isFinite(value) ? clamp(value) : defaultPercent;
  } catch { return defaultPercent; }
}

export function ReadingSplitPane({ document, notes }: { document: ReactNode; notes: ReactNode }) {
  const [percent, setPercent] = useState(initialPercent);
  const [dragging, setDragging] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const lastPercent = useRef(percent);
  function resize(value: number) {
    const next = clamp(value);
    lastPercent.current = next;
    setPercent(next);
  }
  function save() {
    try { localStorage.setItem(preferenceKey, String(lastPercent.current)); } catch { /* 存储受限不影响拖动。 */ }
  }
  return <div ref={container} className={`reading-workspace-grid${dragging ? ' is-resizing' : ''}`} style={{ '--notes-width': `${percent}%` } as CSSProperties}>
    {document}
    <div className="reader-divider" role="separator" tabIndex={0} aria-label="调整笔记宽度" aria-orientation="vertical"
      aria-valuemin={25} aria-valuemax={60} aria-valuenow={Math.round(percent)} aria-valuetext={`笔记占 ${Math.round(percent)}%`}
      title="左右拖动调整笔记宽度；双击恢复默认宽度；也可使用方向键"
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={event => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId) || !container.current) return;
        const bounds = container.current.getBoundingClientRect();
        resize((bounds.right - event.clientX) / bounds.width * 100);
      }}
      onPointerUp={event => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onLostPointerCapture={() => { setDragging(false); save(); }}
      onDoubleClick={() => { resize(defaultPercent); save(); }}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        resize(event.key === 'Home' ? 25 : event.key === 'End' ? 60 : lastPercent.current + (event.key === 'ArrowLeft' ? 2 : -2));
        save();
      }}><span aria-hidden="true">⋮</span></div>
    {notes}
  </div>;
}
