import type { CSSProperties } from 'react';

const paths = {
  home: 'm3 10 9-7 9 7M5 9v11h5v-6h4v6h5V9',
  library: 'M5 3h14v18H5zM8 7h8M8 11h8M8 15h5',
  tag: 'M3 4h8l10 10-7 7L3 10zM7 8h.01',
  chart: 'M4 3v17h17M8 16v-5M13 16V7M18 16V4',
  settings: 'm12 3 2 3 4-.2.5 4 2.5 2.2-2.5 2.2-.5 4-4-.2-2 3-2-3-4 .2-.5-4L3 12l2.5-2.2.5-4 4 .2zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  search: 'M16 10a6 6 0 1 1-12 0 6 6 0 0 1 12 0m-2 5 6 6',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  list: 'M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01',
  arrow: 'M19 12H5m6-6-6 6 6 6',
  check: 'm5 12 4 4L19 6',
  book: 'M12 5v16M3 3c4 0 7 0 9 2 2-2 5-2 9-2v15c-4 0-7 0-9 3-2-3-5-3-9-3z',
  clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9z',
  plus: 'M12 5v14M5 12h14',
  download: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  panel: 'M3 4h18v16H3zM9 4v16',
};
export type IconName = keyof typeof paths;
export function Icon({ name, size = 18, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
