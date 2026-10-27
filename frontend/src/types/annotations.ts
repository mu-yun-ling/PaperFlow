import type { HighlightRect } from '../utils/readingNotes';
export type MarkupTool = 'read' | 'pen' | 'highlight' | 'text' | 'erase';
export type AnnotationInput = { page: number; color: string; text: string } & (
  { kind: 'pen'; geometry: { points: [number, number][] } } |
  { kind: 'highlight'; geometry: { rects: HighlightRect[] } } |
  { kind: 'text'; geometry: { x: number; y: number } }
);
export type PdfAnnotation = AnnotationInput & { id: number };
export interface AnnotationStore {
  items: PdfAnnotation[]; loading: boolean; saving: boolean; error: string; draft: boolean;
  reload: () => void;
  create: (input: AnnotationInput) => Promise<void>;
  update: (id: number, input: AnnotationInput) => Promise<void>;
  remove: (id: number) => Promise<void>;
  setDraft: (active: boolean) => void;
}
