export interface Health {
  status: 'ok';
  database: 'ok';
  service: string;
}

export type ReadingStatus = 'not_started' | 'reading' | 'completed';

export interface PaperFilters {
  is_favorite?: boolean;
  title?: string;
  author?: string;
  tag_id?: number;
  year?: number;
  reading_status?: ReadingStatus;
  research_topic?: string;
  sort_by?: 'year' | 'created_at' | 'updated_at';
  sort_order?: 'asc' | 'desc';
}

export interface Dashboard {
  recent_papers?: Paper[];
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

export type AIAction = 'analysis' | 'keywords' | 'reading-summary';
export interface AIStatus { available: boolean; message: string }
export interface AISettingsInput {
  enabled: boolean; base_url: string; model: string; api_key?: string; clear_api_key?: boolean;
  timeout_seconds: number; max_output_tokens: number; token_parameter: 'max_tokens' | 'max_completion_tokens';
}
export interface AISettings extends Omit<AISettingsInput, 'api_key' | 'clear_api_key'> {
  has_api_key: boolean; source: 'saved' | 'environment';
}
export interface AIResult {
  markdown?: string;
  keywords?: string[];
  source: { kind: 'pdf' | 'abstract'; pages: number[]; total_pages: number; text_chars: number; notes_used: number; warnings: string[] };
}

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
  reading_progress: ReadingProgress | null;
}

export interface ReadingProgress {
  total_pages: number;
  current_page: number;
  max_page: number;
  percent: number;
  last_read_at: string | null;
}

export interface Attachment {
  id: number;
  paper_id: number;
  kind: 'paper' | 'note';
  filename: string;
  mime_type: string;
  size: number;
  created_at: string;
  reading_progress: ReadingProgress | null;
}

export interface PdfExtraction {
  fields: Pick<PaperInput, 'title' | 'authors' | 'year' | 'doi' | 'abstract'>;
  recognized: string[];
  missing: string[];
  warning: string;
}

export interface PaperDetail extends Paper { notes: Note[]; paper_file: Attachment | null; note_attachments: Attachment[] }

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}
