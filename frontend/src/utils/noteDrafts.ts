import type { Note } from '../types/api';
import { parseReadingNote, serializeReadingNote, type NoteSource, type ReadingFields } from './readingNotes.ts';

export interface NoteDraft {
  id: string; note: Note | null; fields?: ReadingFields; source?: NoteSource;
  body: string; baseline: string; updatedAt: number;
}
export interface DraftState { drafts: NoteDraft[]; activeId: string | null; storageError: boolean }
const states = new Map<number, DraftState>();
const listeners = new Map<number, Set<() => void>>();
if (typeof window !== 'undefined') window.addEventListener('beforeunload', event => {
  if ([...states.values()].some(state => state.storageError && state.drafts.some(dirtyDraft))) { event.preventDefault(); event.returnValue = ''; }
});
export const draftContent = (draft: NoteDraft) => draft.fields ? serializeReadingNote(draft.fields, draft.source) : draft.body;
export const dirtyDraft = (draft: NoteDraft) => draftContent(draft) !== draft.baseline;
const key = (paperId: number) => `paperflow.note-drafts.v1:${paperId}`;
function isStoredDraft(d: NoteDraft, paperId: number): boolean {
  try {
    if (!d || typeof d.id !== 'string' || typeof d.body !== 'string' || typeof d.baseline !== 'string' || !Number.isFinite(d.updatedAt)) return false;
    if (d.note && (!Number.isSafeInteger(d.note.id) || d.note.paper_id !== paperId || typeof d.note.content !== 'string')) return false;
    return !d.fields || !!parseReadingNote(serializeReadingNote(d.fields)).fields;
  } catch { return false; }
}

export function readDraftState(paperId: number): DraftState {
  let state = states.get(paperId);
  if (!state) {
    let drafts: NoteDraft[] = [];
    try {
      const stored = JSON.parse(localStorage.getItem(key(paperId)) || 'null');
      if (stored?.version === 1 && Array.isArray(stored.drafts)) drafts = stored.drafts.filter((d: NoteDraft) => isStoredDraft(d, paperId));
    } catch { /* A corrupt cache must not prevent opening saved notes. */ }
    state = { drafts, activeId: null, storageError: false }; states.set(paperId, state);
  }
  return state;
}
export function changeDraftState(paperId: number, update: (state: DraftState) => DraftState) {
  const next = update(readDraftState(paperId));
  try {
    const drafts = next.drafts.filter(dirtyDraft);
    if (drafts.length) localStorage.setItem(key(paperId), JSON.stringify({ version: 1, drafts }));
    else localStorage.removeItem(key(paperId));
    next.storageError = false;
  } catch { next.storageError = true; }
  states.set(paperId, next); listeners.get(paperId)?.forEach(listener => listener());
}
export function subscribeDrafts(paperId: number, listener: () => void) {
  const group = listeners.get(paperId) ?? new Set(); group.add(listener); listeners.set(paperId, group);
  return () => { group.delete(listener); };
}
