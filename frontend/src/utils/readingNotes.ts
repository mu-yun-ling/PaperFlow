export interface HighlightRect { x: number; y: number; width: number; height: number }
export interface NoteSource { fileId: number; page: number; kind: 'excerpt' | 'highlight'; rects?: HighlightRect[] }
export interface ReadingFields { chapter: string; excerpt: string; understanding: string; tags: string[] }
export interface NoteDraftRequest { token: number; source: NoteSource; excerpt: string; explanation?: string }
export const emptyReadingFields = (): ReadingFields => ({ chapter: '', excerpt: '', understanding: '', tags: [] });
const marker = /^<!-- paperflow-source:(\{[^\n]*\}) -->\r?\n/;

export function splitReadingNote(content: string): { source?: NoteSource; body: string } {
  const match = marker.exec(content);
  if (!match) return { body: content };
  try {
    const value = JSON.parse(match[1]);
    if (!Number.isSafeInteger(value.fileId) || value.fileId < 1 || !Number.isSafeInteger(value.page) || value.page < 1 || !['excerpt', 'highlight'].includes(value.kind)) return { body: content };
    const rects = Array.isArray(value.rects) ? value.rects.filter((r: HighlightRect) => r && [r.x, r.y, r.width, r.height].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1) && r.x + r.width <= 1.001 && r.y + r.height <= 1.001).slice(0, 200) : [];
    return { source: { fileId: value.fileId, page: value.page, kind: value.kind, rects }, body: content.slice(match[0].length) };
  } catch { return { body: content }; }
}
export function withNoteSource(body: string, source?: NoteSource) {
  return source ? `<!-- paperflow-source:${JSON.stringify(source)} -->\n${body}` : body;
}
export function excerptNote(text: string, source: NoteSource) {
  // Quoted text cannot break out of its quote and become source metadata.
  return withNoteSource(`${text.trim().split(/\r?\n/).map(line => `> ${line}`).join('\n')}\n\n## 我的理解\n\n${source.kind === 'highlight' ? '高亮标记，留待重读。' : '记下这段内容带给你的想法…'}\n\n## 标签\n\n#阅读摘录`, source);
}

// A readable Markdown copy keeps exports and existing AI summaries useful. The
// versioned marker preserves field boundaries even when a field has headings.
function readingMarkdown(fields: ReadingFields) {
  return `${fields.chapter ? `### ${fields.chapter}\n\n` : ''}## 原文摘录\n\n${fields.excerpt.split('\n').map(line => `> ${line}`).join('\n')}\n\n## 我的理解\n\n${fields.understanding}\n\n## 标签\n\n${fields.tags.map(tag => `#${tag}`).join('  ')}`;
}
export function serializeReadingNote(fields: ReadingFields, source?: NoteSource) {
  const payload = JSON.stringify({ version: 1, ...fields }).replace(/</g, '\\u003c');
  return withNoteSource(`<!-- paperflow-reading:${payload} -->\n${readingMarkdown(fields).trimEnd()}`, source);
}
export function parseReadingNote(content: string): { source?: NoteSource; body: string; fields?: ReadingFields } {
  const parsed = splitReadingNote(content);
  const match = /^<!-- paperflow-reading:(\{[^\n]*\}) -->\r?\n/.exec(parsed.body);
  if (match) {
    try {
      const value = JSON.parse(match[1]);
      if (value.version === 1 && ['chapter', 'excerpt', 'understanding'].every(key => typeof value[key] === 'string') && Array.isArray(value.tags) && value.tags.every((tag: unknown) => typeof tag === 'string')) {
        const fields: ReadingFields = { chapter: value.chapter, excerpt: value.excerpt, understanding: value.understanding, tags: value.tags };
        const body = parsed.body.slice(match[0].length);
        // An external Markdown edit must never be hidden by stale metadata.
        if (body.trimEnd() === readingMarkdown(fields).trimEnd()) return { ...parsed, body, fields };
      }
    } catch { /* Preserve malformed or future-format notes verbatim. */ }
    return parsed;
  }
  // Recognize the exact previous excerpt template without rewriting old notes.
  const legacy = parsed.source && /^((?:>[^\n]*(?:\n|$))+?)\n## 我的理解\n\n([\s\S]*?)\n\n## 标签\n\n([^\n]*)$/.exec(parsed.body);
  if (legacy) return { ...parsed, fields: {
    chapter: '', excerpt: legacy[1].trimEnd().split('\n').map(line => line.replace(/^> ?/, '')).join('\n'),
    understanding: legacy[2], tags: legacy[3].split(/\s+/).filter(Boolean).map(tag => tag.replace(/^#/, '')),
  } };
  return parsed;
}
export function appendUnderstanding(current: string, explanation: string) {
  return [current.trimEnd(), explanation.trim()].filter(Boolean).join('\n\n');
}
