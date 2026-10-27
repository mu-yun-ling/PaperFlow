import { useCallback, useSyncExternalStore } from 'react';
import { changeDraftState, readDraftState, subscribeDrafts, type DraftState } from '../utils/noteDrafts';

export function useNoteDrafts(paperId: number) {
  const state = useSyncExternalStore(useCallback(listener => subscribeDrafts(paperId, listener), [paperId]), useCallback(() => readDraftState(paperId), [paperId]));
  const change = useCallback((update: (state: DraftState) => DraftState) => changeDraftState(paperId, update), [paperId]);
  return { ...state, change };
}
