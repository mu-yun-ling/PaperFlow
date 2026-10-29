import type { AISettings, AISettingsInput, AIAction, AIResult, AIStatus, ApiResponse, Attachment, ReadingProgress, PdfExtraction, Dashboard, Health, Note, Page, Paper, PaperDetail, PaperInput, PaperFilters, TagSummary, PaperTag } from '../types/api';

import type { AnnotationInput, PdfAnnotation } from '../types/annotations';

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

export function paperListParams(page: number, filters: PaperFilters = {}): string {
  const params = new URLSearchParams({ page: String(page), page_size: '20' });
  for (const key of ['title', 'author', 'tag_id', 'year', 'reading_status', 'research_topic', 'is_favorite', 'sort_by', 'sort_order'] as const) {
    const value = filters[key];
    if (value !== undefined && String(value).trim() !== '') params.set(key, String(value).trim());
  }
  return params.toString();
}

async function request<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal; binary?: boolean; timeoutMs?: number; settingsWrite?: boolean } = {}): Promise<T> {
  // 统一保留后端错误码与字段信息，页面可定位重复输入；取消旧请求与连接失败分开处理。
  // 删除成功的 204 没有正文，文件请求返回 Blob，其余成功响应必须含 data。
  const multipart = options.body instanceof FormData;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? (multipart || options.binary ? 60000 : 15000));
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  try {
    const response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      signal,
      headers: options.body === undefined || multipart ? undefined : { 'Content-Type': 'application/json', ...(options.settingsWrite ? { 'X-PaperFlow-Settings': '1' } : {}) },
      body: multipart ? options.body as FormData : options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (response.status === 204) return undefined as T;
    if (response.ok && options.binary) return await response.blob() as T;
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

export function paperRequestBody(body: Partial<PaperInput>, file?: File): Partial<PaperInput> | FormData {
  if (!file) return body;
  const data = new FormData();
  data.append('data', JSON.stringify(body));
  data.append('file', file);
  return data;
}

function fileBody(file: File): FormData {
  const data = new FormData();
  data.append('file', file);
  return data;
}

export const api = {
  ai: {
    explain: (paperId: number, fileId: number, page: number, text: string, signal?: AbortSignal) => request<{ markdown: string }>(`/papers/${paperId}/ai/explain`, { method: 'POST', body: { file_id: fileId, page, text }, signal, timeoutMs: 90000 }),
    settings: (signal?: AbortSignal) => request<AISettings>('/ai/settings', { signal }),
    saveSettings: (body: AISettingsInput) => request<AISettings>('/ai/settings', { method: 'PUT', body, settingsWrite: true }),
    testSettings: (body: AISettingsInput) => request<{ message: string }>('/ai/settings/test', { method: 'POST', body, settingsWrite: true, timeoutMs: 90000 }),
    status: (signal?: AbortSignal) => request<AIStatus>('/ai/status', { signal }),
    generate: (paperId: number, action: AIAction, signal?: AbortSignal) =>
      request<AIResult>(`/papers/${paperId}/ai/${action}`, { method: 'POST', signal, timeoutMs: 90000 }),
    applyKeywords: (paperId: number, keywords: string[]) =>
      request<PaperDetail>(`/papers/${paperId}/ai/keywords/apply`, { method: 'POST', body: { keywords } }),
  },
  health: (signal?: AbortSignal) => request<Health>('/health', { signal }),
  dashboard: (signal?: AbortSignal) => request<Dashboard>('/dashboard', { signal }),
  papers: {
    list: (page = 1, signal?: AbortSignal, filters: PaperFilters = {}) =>
      request<Page<Paper>>(`/papers?${paperListParams(page, filters)}`, { signal }),
    get: (id: number, signal?: AbortSignal) => request<PaperDetail>(`/papers/${id}`, { signal }),
    create: (body: PaperInput, file?: File) => request<PaperDetail>('/papers', { method: 'POST', body: paperRequestBody(body, file) }),
    update: (id: number, body: Partial<PaperInput>, file?: File) => request<PaperDetail>(`/papers/${id}`, { method: 'PATCH', body: paperRequestBody(body, file) }),
    delete: (id: number) => request<void>(`/papers/${id}`, { method: 'DELETE' }),
  },
  files: {
    annotations: (id: number, signal?: AbortSignal) => request<PdfAnnotation[]>(`/files/${id}/annotations`, { signal }),
    createAnnotation: (id: number, body: AnnotationInput) => request<PdfAnnotation>(`/files/${id}/annotations`, { method: 'POST', body }),
    updateAnnotation: (id: number, annotationId: number, body: AnnotationInput) => request<PdfAnnotation>(`/files/${id}/annotations/${annotationId}`, { method: 'PUT', body }),
    deleteAnnotation: (id: number, annotationId: number) => request<void>(`/files/${id}/annotations/${annotationId}`, { method: 'DELETE' }),
    progress: (id: number, body: { total_pages: number; current_page: number; read: boolean }) =>
      request<ReadingProgress>(`/files/${id}/reading-progress`, { method: 'PUT', body }),
    parse: (file: File, signal?: AbortSignal) => request<PdfExtraction>('/papers/parse-pdf', { method: 'POST', body: fileBody(file), signal }),
    uploadNote: (paperId: number, file: File) => request<Attachment>(`/papers/${paperId}/note-attachments`, { method: 'POST', body: fileBody(file) }),
    read: (id: number, signal?: AbortSignal) => request<Blob>(`/files/${id}`, { binary: true, signal }),
    delete: (id: number) => request<void>(`/files/${id}`, { method: 'DELETE' }),
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
