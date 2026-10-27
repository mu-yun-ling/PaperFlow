export interface HighlightRect { x: number; y: number; width: number; height: number }
export interface NoteSource { fileId: number; page: number; kind: 'excerpt' | 'highlight' | 'manual'; rects?: HighlightRect[] }
export interface NoteExcerpt { text: string; source?: NoteSource }
export interface ReadingFields { chapter: string; excerpt: string; understanding: string; tags: string[]; excerpts?: NoteExcerpt[] }
export interface NoteDraftRequest { token: number; source: NoteSource; excerpt: string; explanation?: string; separate?: boolean }
export const emptyReadingFields = (): ReadingFields => ({ chapter: '', excerpt: '', understanding: '', tags: [] });
const marker = /^<!-- paperflow-source:(\{[^\n]*\}) -->\r?\n/;

export function validSource(value: unknown): NoteSource | undefined {
  if (!value || typeof value !== 'object') return;
  const v = value as NoteSource;
  if (!Number.isSafeInteger(v.fileId) || v.fileId < 1 || !Number.isSafeInteger(v.page) || v.page < 1 || !['excerpt', 'highlight', 'manual'].includes(v.kind)) return;
  const rects = Array.isArray(v.rects) ? v.rects.filter(r => r && [r.x, r.y, r.width, r.height].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1) && r.x + r.width <= 1.001 && r.y + r.height <= 1.001).slice(0, 200) : [];
  return { fileId: v.fileId, page: v.page, kind: v.kind, rects: v.kind === 'manual' ? [] : rects };
}

export function splitReadingNote(content: string): { source?: NoteSource; body: string } {
  const match = marker.exec(content);
  if (!match) return { body: content };
  try {
    const source = validSource(JSON.parse(match[1]));
    return source ? { source, body: content.slice(match[0].length) } : { body: content };
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
  const excerpts = fields.excerpts ? fields.excerpts.map(item => `${item.source ? `### P.${item.source.page}\n\n` : ''}${item.text.split('\n').map(line => `> ${line}`).join('\n')}`).join('\n\n') : fields.excerpt.split('\n').map(line => `> ${line}`).join('\n');
  return `${fields.chapter ? `### ${fields.chapter}\n\n` : ''}## 原文摘录\n\n${excerpts}\n\n## 我的理解\n\n${fields.understanding}\n\n## 标签\n\n${fields.tags.map(tag => `#${tag}`).join('  ')}`;
}
export function serializeReadingNote(fields: ReadingFields, source?: NoteSource) {
  const payload = JSON.stringify({ version: fields.excerpts ? 2 : 1, ...fields }).replace(/</g, '\\u003c');
  return withNoteSource(`<!-- paperflow-reading:${payload} -->\n${readingMarkdown(fields).trimEnd()}`, source);
}
export function parseReadingNote(content: string): { source?: NoteSource; body: string; fields?: ReadingFields } {
  const parsed = splitReadingNote(content);
  const match = /^<!-- paperflow-reading:(\{[^\n]*\}) -->\r?\n/.exec(parsed.body);
  if (match) {
    try {
      const value = JSON.parse(match[1]);
      if ([1, 2].includes(value.version) && ['chapter', 'excerpt', 'understanding'].every(key => typeof value[key] === 'string') && Array.isArray(value.tags) && value.tags.every((tag: unknown) => typeof tag === 'string')) {
        const fields: ReadingFields = { chapter: value.chapter, excerpt: value.excerpt, understanding: value.understanding, tags: value.tags };
        if (value.version === 2) {
          if (!Array.isArray(value.excerpts) || value.excerpts.length > 200 || value.excerpts.some((item: NoteExcerpt) => !item || typeof item.text !== 'string' || (item.source !== undefined && !validSource(item.source)))) return parsed;
          fields.excerpts = value.excerpts.map((item: NoteExcerpt) => ({ text: item.text, ...(item.source ? { source: validSource(item.source) } : {}) }));
        }
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

export function noteExcerpts(fields?: ReadingFields, source?: NoteSource): NoteExcerpt[] {
  return fields?.excerpts ?? (fields?.excerpt.trim() ? [{ text: fields.excerpt, source }] : []);
}
export function appendExcerpt(fields: ReadingFields, source: NoteSource | undefined, request: NoteDraftRequest): { fields: ReadingFields; added: boolean } {
  const excerpts = noteExcerpts(fields, source);
  const duplicate = excerpts.some(item => item.text.trim() === request.excerpt.trim() && item.source?.fileId === request.source.fileId && item.source.page === request.source.page);
  return { added: !duplicate, fields: { ...fields, excerpt: '', excerpts: duplicate ? excerpts : [...excerpts, { text: request.excerpt, source: request.source }], understanding: request.explanation ? appendUnderstanding(fields.understanding, request.explanation) : fields.understanding } };
}
export function noteSources(fields?: ReadingFields, source?: NoteSource): NoteSource[] {
  const all = [source, ...noteExcerpts(fields, source).map(item => item.source)].filter((item): item is NoteSource => !!item);
  return all.filter((item, index) => all.findIndex(other => other.fileId === item.fileId && other.page === item.page) === index);
}
