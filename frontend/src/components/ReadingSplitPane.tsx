import { useRef, useState, type CSSProperties, type ReactNode } from 'react';

const preferenceKey = 'paperflow.reader.notesPercent';
const defaultPercent = 36;
function clamp(value: number) { return Math.min(60, Math.max(25, value)); }
function initialPercent(key = preferenceKey, fallback = defaultPercent, min = 25, max = 60) {
  try {
    const saved = localStorage.getItem(key);
    const value = saved === null ? fallback : Number(saved);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  } catch { return fallback; }
}

export type ReadingLayout = 'original' | 'compare' | 'notes';
export function ReadingSplitPane({ document, notes, layout = 'compare' }: { document: ReactNode; notes: ReactNode; layout?: ReadingLayout }) {
  const [comparePercent, setComparePercent] = useState(() => initialPercent());
  const [notesPercent, setNotesPercent] = useState(() => initialPercent(`${preferenceKey}.focus`, 62, 45, 75));
  const focused = layout === 'notes';
  const percent = focused ? notesPercent : comparePercent;
  const minimum = focused ? 45 : 25, maximum = focused ? 75 : 60;
  const [dragging, setDragging] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const lastPercent = useRef(percent);
  lastPercent.current = percent;
  function resize(value: number) {
    const next = focused ? Math.min(maximum, Math.max(minimum, value)) : clamp(value);
    lastPercent.current = next;
    (focused ? setNotesPercent : setComparePercent)(next);
  }
  function save() {
    try { localStorage.setItem(focused ? `${preferenceKey}.focus` : preferenceKey, String(lastPercent.current)); } catch { /* 存储受限不影响拖动。 */ }
  }
  return <div ref={container} className={`reading-workspace-grid layout-${layout}${dragging ? ' is-resizing' : ''}`} style={{ '--notes-width': `${percent}%` } as CSSProperties}>
    {document}
    <div className="reader-divider" role="separator" tabIndex={0} aria-label="调整笔记宽度" aria-orientation="vertical"
      aria-valuemin={minimum} aria-valuemax={maximum} aria-valuenow={Math.round(percent)} aria-valuetext={`笔记占 ${Math.round(percent)}%`}
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
      onDoubleClick={() => { resize(focused ? 62 : defaultPercent); save(); }}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        resize(event.key === 'Home' ? minimum : event.key === 'End' ? maximum : lastPercent.current + (event.key === 'ArrowLeft' ? 2 : -2));
        save();
      }}><span aria-hidden="true">⋮</span></div>
    {notes}
  </div>;
}
