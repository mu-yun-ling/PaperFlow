import type { ApiResponse, Dashboard, Health } from '../types/api';

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api${path}`, { signal });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.error?.message ?? '服务暂时不可用，请确认后端已启动。');
  }
  if (!body || !('data' in body)) throw new Error('服务返回了无法识别的数据。');
  return (body as ApiResponse<T>).data;
}

export const api = {
  health: (signal?: AbortSignal) => get<Health>('/health', signal),
  dashboard: (signal?: AbortSignal) => get<Dashboard>('/dashboard', signal),
};
