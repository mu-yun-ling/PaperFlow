import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeDraftState, dirtyDraft, readDraftState, subscribeDrafts } from '../src/utils/noteDrafts.ts';
import { emptyReadingFields, serializeReadingNote } from '../src/utils/readingNotes.ts';

const cache = new Map();
const storage = { getItem: key => cache.get(key) ?? null, setItem: (key, value) => cache.set(key, value), removeItem: key => cache.delete(key) };
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
const draft = () => ({ id: 'new-1', note: null, fields: emptyReadingFields(), body: '', baseline: serializeReadingNote(emptyReadingFields()), updatedAt: 1 });

test('空草稿不落盘，编辑后共享状态并保存，收起后刷新可恢复', () => {
  const initial = draft();
  changeDraftState(901, state => ({ ...state, activeId: initial.id, drafts: [initial] }));
  assert.equal(cache.has('paperflow.note-drafts.v1:901'), false);
  let notifications = 0;
  const unsubscribe = subscribeDrafts(901, () => notifications++);
  changeDraftState(901, state => ({ ...state, drafts: state.drafts.map(d => ({ ...d, fields: { ...d.fields, understanding: '未提交的想法' } })) }));
  assert.equal(dirtyDraft(readDraftState(901).drafts[0]), true);
  assert.equal(notifications, 1); unsubscribe();
  const persisted = cache.get('paperflow.note-drafts.v1:901');
  cache.set('paperflow.note-drafts.v1:902', persisted);
  assert.equal(readDraftState(902).activeId, null);
  assert.equal(readDraftState(902).drafts[0].fields.understanding, '未提交的想法');
  changeDraftState(901, state => ({ ...state, activeId: null, drafts: [] }));
  assert.equal(cache.has('paperflow.note-drafts.v1:901'), false);
});

test('存储失败不丢内存里的编辑，恢复后可落盘', () => {
  const original = storage.setItem;
  storage.setItem = () => { throw new Error('quota exceeded'); };
  const edited = { ...draft(), fields: { ...emptyReadingFields(), understanding: '保存失败仍保留' } };
  changeDraftState(903, state => ({ ...state, drafts: [edited], activeId: edited.id }));
  assert.equal(readDraftState(903).storageError, true);
  assert.equal(readDraftState(903).drafts[0].fields.understanding, '保存失败仍保留');
  storage.setItem = original;
  changeDraftState(903, state => ({ ...state }));
  assert.equal(readDraftState(903).storageError, false);
  assert.ok(cache.has('paperflow.note-drafts.v1:903'));
});

test('损坏的草稿独立忽略，不影响其他可恢复内容', () => {
  const good = { ...draft(), fields: { ...emptyReadingFields(), understanding: '保留有效内容' } };
  const broken = { ...draft(), id: 'broken', fields: { ...emptyReadingFields(), excerpts: 'broken' } };
  cache.set('paperflow.note-drafts.v1:904', JSON.stringify({ version: 1, drafts: [broken, good] }));
  assert.equal(readDraftState(904).drafts.length, 1);
  assert.equal(readDraftState(904).drafts[0].fields.understanding, '保留有效内容');
});
