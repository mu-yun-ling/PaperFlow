import { useRef, useState, type PointerEvent } from 'react';
import { Alert, App, Button, Input, InputNumber, Modal, Select, Space } from 'antd';
import { errorMessage } from '../api/client';
import { textBounds, transformText } from '../utils/annotationGeometry';
import type { AnnotationInput, AnnotationStore, MarkupTool, PdfAnnotation } from '../types/annotations';

type TextMark = Extract<PdfAnnotation, { kind: 'text' }>;
const colors = [{ value: '#cf654f', label: '珊瑚红' }, { value: '#e8b931', label: '金黄' }, { value: '#4d8063', label: '墨绿' }, { value: '#527eb0', label: '蓝色' }];
export function PdfMarkupLayer({ page, width, height, tool, color, store }: {
  page: number; width: number; height: number; tool: MarkupTool; color: string; store: AnnotationStore;
}) {
  const { message } = App.useApp();
  const [stroke, setStroke] = useState<[number, number][]>([]), [failed, setFailed] = useState('');
  const drawing = useRef<[number, number][] | null>(null);
  const [textEditor, setTextEditor] = useState<{ geometry: TextMark['geometry']; text: string; id?: number; color: string }>();
  const [textError, setTextError] = useState(''), [preview, setPreview] = useState<TextMark>(), [transformError, setTransformError] = useState('');
  const gesture = useRef<{ item: TextMark; x: number; y: number; resize: boolean } | undefined>(undefined);
  const moved = useRef<TextMark | undefined>(undefined);
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
    if (tool === 'text') { setTextError(''); setTextEditor({ geometry: textBounds({ x, y }), text: '', color }); store.setDraft(true); return; }
    if (tool !== 'pen') { if (tool === 'read') store.select(null); return; }
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
    if (store.saving || store.draft) return;
    if (tool === 'erase') { try { await store.remove(item.id); } catch (reason) { message.error(errorMessage(reason)); } }
    else if (tool === 'read') store.select(item.id);
  }
  function editText(item: TextMark) {
    if (store.saving || store.draft || tool !== 'read') return;
    setTextError(''); setTextEditor({ geometry: textBounds(item.geometry), id: item.id, text: item.text, color: item.color }); store.setDraft(true);
  }
  async function saveText() {
    if (!textEditor?.text.trim()) { setTextError('请填写批注文字'); return; }
    const input: AnnotationInput = { page, kind: 'text', color: textEditor.color, text: textEditor.text, geometry: textBounds(textEditor.geometry) };
    try { if (textEditor.id) await store.update(textEditor.id, input); else await store.create(input); setTextEditor(undefined); store.setDraft(false); }
    catch (reason) { setTextError(errorMessage(reason)); }
  }
  async function commitTransform(item: TextMark) {
    setTransformError(''); setPreview(item); store.setDraft(true);
    try { await store.update(item.id, { page: item.page, kind: 'text', color: item.color, text: item.text, geometry: item.geometry }); setPreview(undefined); store.setDraft(false); }
    catch (reason) { setTransformError(errorMessage(reason)); }
  }
  function startTransform(event: PointerEvent<HTMLElement>, item: TextMark, resize: boolean) {
    event.stopPropagation();
    if (event.button !== 0 || store.saving || store.draft || tool !== 'read') return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { item, x: event.clientX, y: event.clientY, resize }; moved.current = item;
    store.select(item.id); store.setDraft(true);
  }
  function transformMove(event: PointerEvent<HTMLElement>) {
    const g = gesture.current; if (!g) return;
    event.preventDefault(); event.stopPropagation();
    const next = { ...g.item, geometry: transformText(g.item.geometry, (event.clientX - g.x) / width, (event.clientY - g.y) / height, g.resize) };
    moved.current = next; setPreview(next);
  }
  function transformEnd(event: PointerEvent<HTMLElement>) {
    if (!gesture.current) return;
    const original = gesture.current.item, next = moved.current;
    gesture.current = undefined; moved.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (next && JSON.stringify(next.geometry) !== JSON.stringify(original.geometry)) void commitTransform(next);
    else { setPreview(undefined); store.setDraft(false); }
  }
  const dragEvents = { onPointerMove: transformMove, onPointerUp: transformEnd, onPointerCancel: () => { gesture.current = undefined; moved.current = undefined; setPreview(undefined); store.setDraft(false); } };
  return <>
    <svg className={`pdf-markup-layer tool-${tool}`} width={width} height={height} onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { drawing.current = null; setStroke([]); store.setDraft(false); }} aria-label={`第 ${page} 页标记层`}>
      {store.items.filter(item => item.page === page).map(saved => {
        const item = preview?.id === saved.id ? preview : saved, selected = item.id === store.selectedId;
        return <g key={item.id} className={`pdf-mark${selected ? ' selected' : ''}`} onPointerDown={event => { if (tool === 'erase' || tool === 'read') event.stopPropagation(); }} onClick={() => void activate(item)}>
          {item.kind === 'pen' && <><polyline points={path(item.geometry.points)} fill="none" stroke={item.color} strokeWidth={Math.max(1.3, width * .003)} strokeLinecap="round" strokeLinejoin="round" /><polyline className="mark-hit" points={path(item.geometry.points)} fill="none" stroke="transparent" strokeWidth="14" /></>}
          {item.kind === 'highlight' && item.geometry.rects.map((r, i) => <rect key={i} x={r.x * width} y={r.y * height} width={r.width * width} height={r.height * height} fill={item.color} fillOpacity=".3" />)}
          {item.kind === 'text' && (() => {
            const box = textBounds(item.geometry);
            return <foreignObject x={box.x * width} y={box.y * height} width={box.width * width} height={box.height * height}>
              <div className={`pdf-text-object${selected && tool === 'read' ? ' is-selected' : ''}`} style={{ borderColor: item.color }} onKeyDown={event => {
                if (!selected || tool !== 'read' || store.saving || store.draft) return;
                const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
                if (direction) { event.preventDefault(); event.stopPropagation(); const step = event.shiftKey ? 10 : 1; void commitTransform({ ...item, geometry: transformText(box, direction[0] * step / width, direction[1] * step / height) }); }
              }}>
                {selected && tool === 'read' && <div className="pdf-text-grip" aria-label="拖动文字批注" onPointerDown={event => startTransform(event, item, false)} {...dragEvents}><span>⠿ 拖动</span><button aria-label="编辑批注文字" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); editText(item); }}>编辑</button></div>}
                <button className="pdf-text-mark" style={{ fontSize: width * box.fontSize }} aria-label={`文字批注：${item.text}`} onClick={event => { event.stopPropagation(); void activate(item); }} onDoubleClick={event => { event.stopPropagation(); editText(item); }}>{item.text}</button>
                {selected && tool === 'read' && <button className="pdf-text-resize" aria-label="调整文字批注尺寸" onClick={event => event.stopPropagation()} onPointerDown={event => startTransform(event, item, true)} {...dragEvents} />}
              </div>
            </foreignObject>;
          })()}
        </g>;
      })}
      {!!stroke.length && <polyline points={path(stroke)} fill="none" stroke={color} strokeWidth={Math.max(1.3, width * .003)} strokeLinecap="round" />}
    </svg>
    {failed && <div className="markup-retry"><Alert type="warning" title={`画线尚未保存：${failed}`} /><Button onClick={() => void saveStroke()} loading={store.saving}>重试保存</Button><Button disabled={store.saving} onClick={() => { setStroke([]); setFailed(''); store.setDraft(false); }}>放弃此笔</Button></div>}
    {transformError && preview && <div className="markup-retry"><Alert type="warning" title={`批注调整尚未保存：${transformError}`} /><Button loading={store.saving} onClick={() => void commitTransform(preview)}>重试保存</Button><Button disabled={store.saving} onClick={() => { setPreview(undefined); setTransformError(''); store.setDraft(false); }}>恢复原位置</Button></div>}
    {textEditor && <Modal open title={`P.${page} · ${textEditor.id ? '编辑' : '添加'}文字批注`} onOk={() => void saveText()} confirmLoading={store.saving} okText="保存批注" cancelText="取消" mask={{ closable: false }} closable={!store.saving} cancelButtonProps={{ disabled: store.saving }} onCancel={() => { if (!store.saving) { setTextEditor(undefined); store.setDraft(false); } }}>
      <p className="muted">保存后可拖动批注上方的把手移动，拖动右下角调整文本框。</p><Input.TextArea aria-label="批注文字" value={textEditor.text} maxLength={2000} showCount autoSize={{ minRows: 3, maxRows: 10 }} disabled={store.saving} onChange={event => setTextEditor({ ...textEditor, text: event.target.value })} />
      <Space className="annotation-properties" wrap><span>字号</span><InputNumber aria-label="批注字号" min={5} max={48} value={Math.round((textEditor.geometry.fontSize ?? .018) * 600)} disabled={store.saving} onChange={value => setTextEditor({ ...textEditor, geometry: { ...textEditor.geometry, fontSize: (value ?? 12) / 600 } })} /><Select aria-label="批注颜色" value={textEditor.color} options={colors} disabled={store.saving} onChange={next => setTextEditor({ ...textEditor, color: next })} /></Space>
      {textError && <Alert type="error" title={textError} />}
    </Modal>}
  </>;
}
