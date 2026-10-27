import type { PaperFilters } from '../types/api';

export interface FilterValues extends Omit<PaperFilters, 'year'> { year?: string }

export const defaultFilters: FilterValues = { sort_by: 'created_at', sort_order: 'desc' };

export function yearError(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  const max = new Date().getUTCFullYear() + 1;
  if (!/^\d{4}$/.test(value.trim()) || Number(value) < 1000 || Number(value) > max) {
    return `请输入 1000 至 ${max} 之间的整数年份`;
  }
}

export function normalizeFilters(values: FilterValues): PaperFilters {
  return {
    title: values.title?.trim() || undefined,
    author: values.author?.trim() || undefined,
    tag_id: values.tag_id,
    year: values.year?.trim() ? Number(values.year) : undefined,
    reading_status: values.reading_status,
    research_topic: values.research_topic?.trim() || undefined,
    is_favorite: values.is_favorite,
    sort_by: values.sort_by ?? 'created_at',
    sort_order: values.sort_order ?? 'desc',
  };
}

export function hasFilters(filters: PaperFilters): boolean {
  return !!(filters.title || filters.author || filters.tag_id || filters.year || filters.reading_status || filters.research_topic || filters.is_favorite !== undefined);
}
