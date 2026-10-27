import { useRef, useState, type PointerEvent } from 'react';
import { Alert, App, Button, Input, Modal } from 'antd';
import { errorMessage } from '../api/client';
import type { AnnotationInput, AnnotationStore, MarkupTool, PdfAnnotation } from '../types/annotations';

export function PdfMarkupLayer({ page, width, height, tool, color, store }: {
  page: number; width: number; height: number; tool: MarkupTool; color: string; store: AnnotationStore;
}) {
  const { message } = App.useApp();
  const [stroke, setStroke] = useState<[number, number][]>([]);
  const drawing = useRef<[number, number][] | null>(null);
  const [failed, setFailed] = useState('');
  const [textEditor, setTextEditor] = useState<{ x: number; y: number; text: string; id?: number; color: string }>();
  const [textError, setTextError] = useState('');
  const point = (event: PointerEvent<SVGSVGElement>): [number, number] => {
    const box = event.currentTarget.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), Math.max(0, Math.min(1, (event.clientY - box.top) / box.height))];
  };
  const path = (points: [number, number][]) => points.map(([x, y]) => `${x * width},${y * height}`).join(' ');
  async function saveStroke(points = stroke) {
    setFailed('');
    try { await store.create({ page, kind: 'pen', color, text: '', geometry: { points } }); setStroke([]); store.setDraft(false); }
    catch (reason) { setFailed(errorMessage(reason)); }
  }
  function begin(event: PointerEvent<SVGSVGElement>) {
    if (store.saving || store.loading || store.error || store.draft || stroke.length || textEditor || event.button !== 0) return;
    const [x, y] = point(event);
    if (tool === 'text') { setTextEditor({ x: Math.min(x, .78), y: Math.min(y, .9), text: '', color }); store.setDraft(true); return; }
    if (tool !== 'pen') return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = [[x, y]]; setStroke([[x, y]]); store.setDraft(true);
  }
  function move(event: PointerEvent<SVGSVGElement>) {
    if (!drawing.current) return;
    const next = point(event), last = drawing.current.at(-1)!;
    if (Math.hypot((next[0] - last[0]) * width, (next[1] - last[1]) * height) < 2) return;
    if (drawing.current.length < 2000) drawing.current.push(next);
    setStroke([...drawing.current]);
  }
  function finish(event: PointerEvent<SVGSVGElement>) {
    if (!drawing.current) return;
    const points = drawing.current; drawing.current = null;
    if (points.length === 1) points.push(point(event));
    setStroke([...points]); void saveStroke(points);
  }
  async function activate(item: PdfAnnotation) {
    if (store.saving || stroke.length || textEditor) return;
    if (tool === 'erase') {
      try { await store.remove(item.id); } catch (reason) { message.error(errorMessage(reason)); }
    } else if (tool === 'read' && item.kind === 'text') {
      setTextError(''); setTextEditor({ ...item.geometry, id: item.id, text: item.text, color: item.color }); store.setDraft(true);
    }
  }
  async function saveText() {
    if (!textEditor?.text.trim()) { setTextError('请填写批注文字'); return; }
    const input: AnnotationInput = { page, kind: 'text', color: textEditor.color, text: textEditor.text, geometry: { x: textEditor.x, y: textEditor.y } };
    try {
      if (textEditor.id) await store.update(textEditor.id, input); else await store.create(input);
      setTextEditor(undefined); store.setDraft(false);
    } catch (reason) { setTextError(errorMessage(reason)); }
  }
  return <>
    <svg className={`pdf-markup-layer tool-${tool}`} width={width} height={height} onPointerDown={begin} onPointerMove={move} onPointerUp={finish}
      onPointerCancel={() => { drawing.current = null; setStroke([]); store.setDraft(false); }} aria-label={`第 ${page} 页标记层`}>
      {store.items.filter(item => item.page === page).map(item => <g key={item.id} className="pdf-mark" onPointerDown={event => { if (tool === 'erase' || (tool === 'read' && item.kind === 'text')) event.stopPropagation(); }} onClick={() => void activate(item)}>
        {item.kind === 'pen' && <><polyline points={path(item.geometry.points)} fill="none" stroke={item.color} strokeWidth={Math.max(1.3, width * .003)} strokeLinecap="round" strokeLinejoin="round" /><polyline className="mark-hit" points={path(item.geometry.points)} fill="none" stroke="transparent" strokeWidth="14" /></>}
        {item.kind === 'highlight' && item.geometry.rects.map((r, i) => <rect key={i} x={r.x * width} y={r.y * height} width={r.width * width} height={r.height * height} fill={item.color} fillOpacity=".3" />)}
        {item.kind === 'text' && <foreignObject x={item.geometry.x * width} y={item.geometry.y * height} width={width * .22} height={Math.max(30, (1 - item.geometry.y) * height)}>
          <button className="pdf-text-mark" style={{ borderColor: item.color, fontSize: Math.max(8, width * .018) }} aria-label={`文字批注：${item.text}`} onClick={event => { event.stopPropagation(); void activate(item); }}>{item.text}</button>
        </foreignObject>}
      </g>)}
      {!!stroke.length && <polyline points={path(stroke)} fill="none" stroke={color} strokeWidth={Math.max(1.3, width * .003)} strokeLinecap="round" />}
    </svg>
    {failed && <div className="markup-retry"><Alert type="warning" title={`画线尚未保存：${failed}`} /><Button onClick={() => void saveStroke()} loading={store.saving}>重试保存</Button><Button disabled={store.saving} onClick={() => { setStroke([]); setFailed(''); store.setDraft(false); }}>放弃此笔</Button></div>}
    {textEditor && <Modal open title={`P.${page} · ${textEditor.id ? '编辑' : '添加'}文字批注`} onOk={() => void saveText()} confirmLoading={store.saving} okText="保存批注" cancelText="取消" mask={{ closable: false }} closable={!store.saving} cancelButtonProps={{ disabled: store.saving }} onCancel={() => { if (!store.saving) { setTextEditor(undefined); store.setDraft(false); } }}>
      <p className="muted">批注显示在点击的位置，可放在正文旁的空白处。</p><Input.TextArea aria-label="批注文字" value={textEditor.text} maxLength={2000} showCount autoSize={{ minRows: 3, maxRows: 10 }} onChange={event => setTextEditor({ ...textEditor, text: event.target.value })} />
      {textError && <Alert type="error" title={textError} />}
    </Modal>}
  </>;
}
