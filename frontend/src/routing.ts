import { useSyncExternalStore } from 'react';

type Route = { page: 'papers' | 'new' | 'tags' | 'dashboard' | 'ai-settings' | 'not-found' }
  | { page: 'detail' | 'edit'; id: number; read?: boolean };

export function parseRoute(hash: string): Route {
  const [path, query = ''] = (hash.replace(/^#/, '') || '/papers').split('?');
  if (path === '/papers' || path === '/') return { page: 'papers' };
  if (path === '/papers/new') return { page: 'new' };
  if (path === '/tags') return { page: 'tags' };
  if (path === '/dashboard' || path === '/dashboard#statistics') return { page: 'dashboard' };
  if (path === '/settings/ai') return { page: 'ai-settings' };
  const match = /^\/papers\/([1-9]\d*)(\/edit)?$/.exec(path);
  if (match && Number.isSafeInteger(Number(match[1]))) {
    return { page: match[2] ? 'edit' : 'detail', id: Number(match[1]), ...(!match[2] && new URLSearchParams(query).get('read') === '1' ? { read: true } : {}) };
  }
  return { page: 'not-found' };
}

function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}

export function navigate(path: string) {
  window.location.hash = path;
}
