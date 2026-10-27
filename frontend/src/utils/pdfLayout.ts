export interface PageSize { width: number; height: number }
export interface PageBox { top: number; height: number }
export function pdfLayout(sizes: PageSize[], width: number, gap = 16): PageBox[] {
  let top = 0;
  return sizes.map(size => {
    const height = width * size.height / size.width;
    const box = { top, height }; top += height + gap; return box;
  });
}
export function pageAtOffset(boxes: PageBox[], offset: number) {
  let low = 0, high = boxes.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (boxes[mid].top <= offset) low = mid; else high = mid - 1;
  }
  return low + 1;
}
export function storedOffset(raw: string | null, page: number) {
  try {
    const value = JSON.parse(raw ?? 'null');
    return value?.page === page && Number.isFinite(value.offset) && Math.abs(value.offset) <= 1 ? value.offset as number : 0;
  } catch { return 0; }
}
