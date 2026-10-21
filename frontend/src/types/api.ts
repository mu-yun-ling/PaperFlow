export interface Health {
  status: 'ok';
  database: 'ok';
  service: string;
}

export type ReadingStatus = 'not_started' | 'reading' | 'completed';

export interface Dashboard {
  total: number;
  not_started: number;
  reading: number;
  completed: number;
  favorites: number;
  by_status: { status: ReadingStatus; count: number }[];
  by_year: { year: number | null; count: number }[];
  by_tag: { id: number; name: string; count: number }[];
}

export interface ApiResponse<T> { data: T }

export interface PaperTag {
  id: number;
  name: string;
  created_at: string;
}

export interface TagSummary extends PaperTag { paper_count: number }

export interface Note {
  id: number;
  paper_id: number;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface PaperInput {
  title: string;
  authors: string;
  year: number | null;
  venue: string;
  doi: string | null;
  url: string | null;
  abstract: string;
  research_topic: string;
  reading_status: ReadingStatus;
  is_favorite: boolean;
  tag_ids: number[];
}

export interface Paper extends Omit<PaperInput, 'tag_ids'> {
  id: number;
  tags: PaperTag[];
  created_at: string;
  updated_at: string;
}

export interface PaperDetail extends Paper { notes: Note[] }

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}
