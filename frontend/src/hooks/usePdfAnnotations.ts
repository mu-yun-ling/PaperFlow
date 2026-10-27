import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import type { AnnotationInput, PdfAnnotation } from '../types/annotations';

export function usePdfAnnotations(fileId: number) {
  const [items, setItems] = useState<PdfAnnotation[]>([]);
  const [loading, setLoading] = useState(true), [saving, setSaving] = useState(false);
  const [error, setError] = useState(''), [version, setVersion] = useState(0);
  const [draft, setDraft] = useState(false);
  const lock = useRef(false);
  const reload = useCallback(() => setVersion(n => n + 1), []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    api.files.annotations(fileId, controller.signal).then(setItems).catch(reason => {
      if (!controller.signal.aborted) setError(errorMessage(reason));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [fileId, version]);
  async function mutate(action: () => Promise<void>) {
    if (lock.current) throw new Error('正在保存标记，请稍后再试');
    lock.current = true; setSaving(true);
    try { await action(); } finally { lock.current = false; setSaving(false); }
  }
  const create = (input: AnnotationInput) => mutate(async () => {
    const saved = await api.files.createAnnotation(fileId, input); setItems(list => [...list, saved]);
  });
  const update = (id: number, input: AnnotationInput) => mutate(async () => {
    const saved = await api.files.updateAnnotation(fileId, id, input); setItems(list => list.map(item => item.id === id ? saved : item));
  });
  const remove = (id: number) => mutate(async () => {
    await api.files.deleteAnnotation(fileId, id); setItems(list => list.filter(item => item.id !== id));
  });
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (saving || draft) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [saving, draft]);
  return { items, loading, saving, error, reload, create, update, remove, draft, setDraft };
}
