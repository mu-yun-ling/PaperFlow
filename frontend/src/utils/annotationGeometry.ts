import type { AnnotationInput } from '../types/annotations';

export type TextGeometry = Extract<AnnotationInput, { kind: 'text' }>['geometry'];
export function textBounds(geometry: TextGeometry) {
  const width = Math.max(.03, Math.min(1, geometry.width ?? .22));
  const height = Math.max(.02, Math.min(1, geometry.height ?? .12));
  return { x: Math.max(0, Math.min(1 - width, geometry.x)), y: Math.max(0, Math.min(1 - height, geometry.y)), width, height, fontSize: Math.max(.008, Math.min(.08, geometry.fontSize ?? .018)) };
}
export function transformText(geometry: TextGeometry, dx: number, dy: number, resize = false) {
  const box = textBounds(geometry);
  return resize ? { ...box, width: Math.min(1 - box.x, Math.max(.06, box.width + dx)), height: Math.min(1 - box.y, Math.max(.04, box.height + dy)) } : { ...box, x: Math.max(0, Math.min(1 - box.width, box.x + dx)), y: Math.max(0, Math.min(1 - box.height, box.y + dy)) };
}
