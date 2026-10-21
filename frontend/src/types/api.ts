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
