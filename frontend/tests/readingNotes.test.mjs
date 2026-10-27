import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendExcerpt, appendUnderstanding, emptyReadingFields, excerptNote, noteExcerpts, noteSources, parseReadingNote, serializeReadingNote, splitReadingNote, withNoteSource } from '../src/utils/readingNotes.ts';

test('摘录、页码、附件和高亮坐标可保存并重新载入，编辑保留原文关联', () => {
  const source = { fileId: 4, page: 6, kind: 'highlight', rects: [{ x: .1, y: .2, width: .4, height: .03 }] };
  const note = excerptNote('First line\nSecond line', source);
  const parsed = splitReadingNote(note);
  assert.deepEqual(parsed.source, source);
  assert.match(parsed.body, /> First line\n> Second line/);
  assert.match(parsed.body, /## 我的理解/);
  assert.deepEqual(splitReadingNote(withNoteSource('新的理解 $x^2$', parsed.source)), { source, body: '新的理解 $x^2$' });
});
test('旧 Markdown 不变，损坏的定位标记不会吞掉内容', () => {
  for (const content of ['## 原笔记\n\n内容', '<!-- paperflow-source:{bad} -->\n文本', '<!-- paperflow-source:{"fileId":-1,"page":2,"kind":"excerpt"} -->\n内容']) {
    assert.deepEqual(splitReadingNote(content), { body: content });
  }
});
test('引用内的标记不替代真实来源，越界坐标被丢弃', () => {
  const source = { fileId: 1, page: 2, kind: 'excerpt', rects: [{ x: .8, y: .1, width: .8, height: .1 }, { x: 0, y: 0, width: .1, height: .1 }] };
  const parsed = splitReadingNote(excerptNote('<!-- paperflow-source:{"fileId":9,"page":9,"kind":"excerpt"} -->', source));
  assert.equal(parsed.source.fileId, 1);
  assert.equal(parsed.source.page, 2);
  assert.equal(parsed.source.rects.length, 1);
  assert.match(parsed.body, /^> <!--/);
});

test('结构化笔记保存完整字段、公式和来源，理解中的同名标题不破坏字段', () => {
  const source = { fileId: 7, page: 3, kind: 'excerpt', rects: [] };
  const fields = { chapter: '3.3 Sampling', excerpt: 'One\nTwo <!-- marker -->', understanding: '我的观点 $x^2$\n\n## 标签\n这里仍是理解', tags: ['RL', '公式'] };
  const saved = serializeReadingNote(fields, source);
  assert.deepEqual(parseReadingNote(saved).fields, fields);
  assert.deepEqual(parseReadingNote(saved).source, source);
  assert.match(parseReadingNote(saved).body, /我的观点 \$x\^2\$/);
});

test('手动笔记不绑定来源，空摘录与标签可往返保存', () => {
  const fields = { ...emptyReadingFields(), understanding: '手动记录 **重点**，$$E=mc^2$$' };
  // The existing API trims content before persisting it, including empty tags.
  const saved = parseReadingNote(serializeReadingNote(fields).trim());
  assert.deepEqual(saved.fields, fields);
  assert.equal(saved.source, undefined);
});

test('服务端去掉末尾空白后仍保留带空行的理解字段，兼容早先保存的格式', () => {
  const fields = { ...emptyReadingFields(), understanding: '理解\n\n' };
  const content = serializeReadingNote(fields);
  assert.deepEqual(parseReadingNote(content.trim()).fields, fields);
  assert.deepEqual(parseReadingNote(content + '\n\n').fields, fields);
});

test('旧摘录卡片可读可编辑，旧 Markdown 与外部修改不会被元数据覆盖', () => {
  const source = { fileId: 1, page: 2, kind: 'excerpt' };
  const old = excerptNote('原文\n第二行', source);
  assert.equal(parseReadingNote(old).fields.excerpt, '原文\n第二行');
  assert.equal(parseReadingNote('## 旧笔记\n\n原有公式 $x$').fields, undefined);
  const saved = serializeReadingNote({ ...emptyReadingFields(), understanding: '原理解' });
  const externallyEdited = saved.replace('## 我的理解\n\n原理解', '## 我的理解\n\n外部修改');
  assert.equal(parseReadingNote(externallyEdited).fields, undefined);
  assert.match(parseReadingNote(externallyEdited).body, /外部修改/);
});

test('AI 解释追加理解而非替换用户文字', () => {
  assert.equal(appendUnderstanding('用户自己的理解', 'AI 的解释 $x^2$'), '用户自己的理解\n\nAI 的解释 $x^2$');
  assert.equal(appendUnderstanding('', 'AI 的解释'), 'AI 的解释');
});

test('手动页码与跨页摘录各自保留来源，重复摘录不覆盖理解', () => {
  const source = { fileId: 4, page: 2, kind: 'manual' };
  let fields = { ...emptyReadingFields(), understanding: '我写到一半的理解 $x$' };
  const a = { token: 1, source: { fileId: 4, page: 2, kind: 'excerpt', rects: [{ x: .1, y: .8, width: .3, height: .02 }] }, excerpt: '第一页的证据' };
  const b = { token: 2, source: { fileId: 4, page: 5, kind: 'excerpt' }, excerpt: '另一页的证据' };
  fields = appendExcerpt(fields, source, a).fields;
  fields = appendExcerpt(fields, source, b).fields;
  const repeated = appendExcerpt(fields, source, a);
  assert.equal(repeated.added, false);
  assert.equal(repeated.fields.understanding, '我写到一半的理解 $x$');
  const saved = parseReadingNote(serializeReadingNote(repeated.fields, source).trim());
  assert.equal(saved.source.kind, 'manual');
  assert.deepEqual(noteSources(saved.fields, saved.source).map(s => s.page), [2, 5]);
  assert.deepEqual(noteExcerpts(saved.fields).map(e => e.source.page), [2, 5]);
  assert.equal(saved.fields.excerpts[0].source.rects[0].y, .8);
  assert.match(saved.body, /### P\.5/);
});

test('旧单摘录升级时不丢文本，手动页码不会冒充高亮，修改后的正文可见', () => {
  const old = { ...emptyReadingFields(), excerpt: '原有摘录', understanding: '原理解', chapter: '旧章节' };
  const request = { token: 3, source: { fileId: 8, page: 6, kind: 'excerpt' }, excerpt: '新摘录', explanation: '解释' };
  const upgraded = appendExcerpt(old, { fileId: 8, page: 3, kind: 'excerpt' }, request).fields;
  assert.equal(upgraded.chapter, '旧章节');
  assert.deepEqual(upgraded.excerpts.map(e => e.text), ['原有摘录', '新摘录']);
  assert.equal(upgraded.understanding, '原理解\n\n解释');
  const manual = splitReadingNote(withNoteSource('内容', { fileId: 8, page: 3, kind: 'manual', rects: [{ x: 0, y: 0, width: .1, height: .1 }] }));
  assert.deepEqual(manual.source.rects, []);
  const saved = serializeReadingNote(upgraded).replace('## 我的理解\n\n原理解', '## 我的理解\n\n外部修改');
  assert.equal(parseReadingNote(saved).fields, undefined);
  assert.match(parseReadingNote(saved).body, /外部修改/);
});
