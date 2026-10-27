import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { AnnotationInput, PdfAnnotation } from '../types/annotations';

interface Change { before?: PdfAnnotation; after?: PdfAnnotation }
function inputOf(item: AnnotationInput): AnnotationInput {
  return { page: item.page, kind: item.kind, color: item.color, geometry: item.geometry, text: item.text } as AnnotationInput;
}
export function usePdfAnnotations(fileId: number) {
  const [items, setItems] = useState<PdfAnnotation[]>([]), [selectedId, select] = useState<number | null>(null);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [error, setError] = useState(''), [version, setVersion] = useState(0);
  const [draft, setDraft] = useState(false), [, redraw] = useState(0);
  const lock = useRef(false), current = useRef(items), past = useRef<Change[]>([]), future = useRef<Change[]>([]);
  current.current = items;
  const reload = useCallback(() => setVersion(n => n + 1), []);
  const replace = (next: PdfAnnotation[]) => { current.current = next; setItems(next); };
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api.files.annotations(fileId, controller.signal).then(list => { replace(list); past.current = []; future.current = []; select(null); redraw(n => n + 1); }).catch(reason => {
      if (!controller.signal.aborted) setError(errorMessage(reason));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [fileId, version]);
  async function mutate(action: () => Promise<void>) {
    if (lock.current) throw new Error('正在保存标记，请稍后再试');
    lock.current = true; setSaving(true);
    try { await action(); } finally { lock.current = false; setSaving(false); }
  }
  function remember(change: Change) { past.current = [...past.current.slice(-49), change]; future.current = []; redraw(n => n + 1); }
  const create = (input: AnnotationInput) => mutate(async () => {
    const saved = await api.files.createAnnotation(fileId, inputOf(input)); replace([...current.current, saved]); remember({ after: saved });
  });
  const update = (id: number, input: AnnotationInput) => mutate(async () => {
    const before = current.current.find(item => item.id === id);
    const saved = await api.files.updateAnnotation(fileId, id, inputOf(input)); replace(current.current.map(item => item.id === id ? saved : item)); remember({ before, after: saved });
  });
  const remove = (id: number) => mutate(async () => {
    const before = current.current.find(item => item.id === id);
    await api.files.deleteAnnotation(fileId, id); replace(current.current.filter(item => item.id !== id)); select(null); remember({ before });
  });
  async function travel(redo: boolean) {
    if (draft) return;
    await mutate(async () => {
      const from = redo ? future : past, to = redo ? past : future;
      const entry = from.current.at(-1); if (!entry) return;
      const target = redo ? entry.after : entry.before, existing = redo ? entry.before : entry.after;
      let next = entry;
      if (target && existing) {
        const saved = await api.files.updateAnnotation(fileId, existing.id, inputOf(target));
        replace(current.current.map(item => item.id === existing.id ? saved : item));
        next = { before: { ...entry.before!, id: saved.id }, after: { ...entry.after!, id: saved.id } };
      } else if (target) {
        const saved = await api.files.createAnnotation(fileId, inputOf(target)); replace([...current.current, saved]);
        const rebind = (change: Change): Change => ({ before: change.before?.id === target.id ? { ...change.before, id: saved.id } : change.before, after: change.after?.id === target.id ? { ...change.after, id: saved.id } : change.after });
        past.current = past.current.map(rebind); future.current = future.current.map(rebind);
        next = redo ? { ...entry, after: saved } : { ...entry, before: saved };
      } else if (existing) { await api.files.deleteAnnotation(fileId, existing.id); replace(current.current.filter(item => item.id !== existing.id)); }
      from.current.pop(); to.current.push(next); select(null); redraw(n => n + 1);
    });
  }
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (saving || draft) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [saving, draft]);
  return { items, loading, saving, error, reload, create, update, remove, draft, setDraft, selectedId, select, canUndo: past.current.length > 0, canRedo: future.current.length > 0, undo: () => travel(false), redo: () => travel(true) };
}
