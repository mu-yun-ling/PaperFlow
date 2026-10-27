import type { FilterValues } from './paperFilters';

export interface LibraryQuery { page: number; filters: FilterValues }
export function parseLibraryQuery(query: string): LibraryQuery {
  const params = new URLSearchParams(query), filters: FilterValues = { sort_by: 'created_at', sort_order: 'desc' };
  for (const key of ['title', 'author', 'year', 'research_topic'] as const) if (params.get(key)) filters[key] = params.get(key)!;
  if (/^[1-9]\d*$/.test(params.get('tag_id') || '') && Number.isSafeInteger(Number(params.get('tag_id')))) filters.tag_id = Number(params.get('tag_id'));
  const status = params.get('reading_status'); if (status === 'not_started' || status === 'reading' || status === 'completed') filters.reading_status = status;
  if (params.get('is_favorite') === 'true') filters.is_favorite = true;
  const sort = params.get('sort_by'); if (sort === 'year' || sort === 'updated_at' || sort === 'created_at') filters.sort_by = sort;
  if (params.get('sort_order') === 'asc') filters.sort_order = 'asc';
  const page = Number(params.get('page'));
  return { page: Number.isSafeInteger(page) && page > 0 ? page : 1, filters };
}
