import type { ApiResponse, Dashboard, Health, Note, Page, Paper, PaperDetail, PaperInput, TagSummary, PaperTag } from '../types/api';

export class ApiError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor(message: string, status: number, code: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试。';
}

async function request<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const timeout = AbortSignal.timeout(15000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    const response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      signal,
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (response.status === 204) return undefined as T;
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(body?.error?.message ?? '服务暂时不可用，请确认后端已启动。',
        response.status, body?.error?.code ?? 'HTTP_ERROR', body?.error?.details ?? {});
    }
    if (!body || typeof body !== 'object' || !('data' in body)) throw new Error('服务返回了无法识别的数据。');
    return (body as ApiResponse<T>).data;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (timeout.aborted) throw new Error('请求超时，请检查服务连接后重试。');
    if (error instanceof TypeError) throw new Error('无法连接服务，请确认后端已启动后重试。');
    throw error;
  }
}

export const api = {
  health: (signal?: AbortSignal) => request<Health>('/health', { signal }),
  dashboard: (signal?: AbortSignal) => request<Dashboard>('/dashboard', { signal }),
  papers: {
    list: (page = 1, signal?: AbortSignal) => request<Page<Paper>>(`/papers?page=${page}&page_size=20`, { signal }),
    get: (id: number, signal?: AbortSignal) => request<PaperDetail>(`/papers/${id}`, { signal }),
    create: (body: PaperInput) => request<PaperDetail>('/papers', { method: 'POST', body }),
    update: (id: number, body: Partial<PaperInput>) => request<PaperDetail>(`/papers/${id}`, { method: 'PATCH', body }),
    delete: (id: number) => request<void>(`/papers/${id}`, { method: 'DELETE' }),
  },
  tags: {
    list: (signal?: AbortSignal) => request<TagSummary[]>('/tags', { signal }),
    create: (name: string) => request<PaperTag>('/tags', { method: 'POST', body: { name } }),
    delete: (id: number) => request<void>(`/tags/${id}`, { method: 'DELETE' }),
  },
  notes: {
    list: (paperId: number, signal?: AbortSignal) => request<Note[]>(`/papers/${paperId}/notes`, { signal }),
    create: (paperId: number, content: string) => request<Note>(`/papers/${paperId}/notes`, { method: 'POST', body: { content } }),
    update: (id: number, content: string) => request<Note>(`/notes/${id}`, { method: 'PATCH', body: { content } }),
    delete: (id: number) => request<void>(`/notes/${id}`, { method: 'DELETE' }),
  },
};
