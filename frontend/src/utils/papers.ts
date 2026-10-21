import type { ReadingStatus } from '../types/api';

export const readingOptions: { value: ReadingStatus; label: string }[] = [
  { value: 'not_started', label: '未开始' },
  { value: 'reading', label: '阅读中' },
  { value: 'completed', label: '已读完' },
];

export function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function safeExternalUrl(value: string | null) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch { return undefined; }
}
