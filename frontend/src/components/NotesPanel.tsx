import { useCallback, useState } from 'react';
import { App, Button, Card, Empty, Popconfirm, Skeleton, Space } from 'antd';
import { api, errorMessage } from '../api/client';
import { useResource } from '../hooks/useResource';
import type { Note } from '../types/api';
import { formatTime } from '../utils/papers';
import { LoadError } from './LoadError';
import { NoteEditor } from './NoteEditor';

export function NotesPanel({ paperId }: { paperId: number }) {
  const { message } = App.useApp();
  const load = useCallback((signal: AbortSignal) => api.notes.list(paperId, signal), [paperId]);
  const { data, error, loading, reload } = useResource(load);
  const [editor, setEditor] = useState<{ note: Note | null } | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  async function remove(id: number) {
    if (deleting !== null) return;
    setDeleting(id);
    try { await api.notes.delete(id); message.success('笔记已删除'); reload(); }
    catch (reason) { message.error(errorMessage(reason)); }
    finally { setDeleting(null); }
  }

  async function save(content: string) {
    if (editor?.note) await api.notes.update(editor.note.id, content);
    else await api.notes.create(paperId, content);
    message.success('笔记已保存');
    reload();
  }

  return <section className="notes-section" aria-label="阅读笔记">
    <div className="section-heading"><h2>阅读笔记{data ? ` · ${data.length}` : ''}</h2>
      <Space><Button size="small" onClick={reload} loading={loading}>刷新笔记</Button>
        <Button type="primary" onClick={() => setEditor({ note: null })} disabled={loading || !!error || deleting !== null}>新增笔记</Button></Space>
    </div>
    {loading ? <Skeleton active /> : error ? <LoadError error={error} retry={reload} /> : data?.length ?
      <div className="note-list">{data.map((note) => <Card key={note.id} className="note-card" size="small">
        <p className="note-content">{note.content}</p>
        <div className="note-footer"><span className="muted">更新于 {formatTime(note.updated_at)}</span><Space>
          <Button size="small" onClick={() => setEditor({ note })} disabled={deleting !== null}>编辑笔记</Button>
          <Popconfirm title="删除这条笔记？" description="此操作无法撤销。" okText="确认删除" cancelText="取消"
            onConfirm={() => remove(note.id)} okButtonProps={{ danger: true, loading: deleting === note.id }}>
            <Button danger size="small" disabled={deleting !== null} loading={deleting === note.id}>删除笔记</Button>
          </Popconfirm>
        </Space></div>
      </Card>)}</div> : <Card><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有笔记，记下阅读中的第一个想法吧。" /></Card>}
    {editor && <NoteEditor note={editor.note} onSave={save} onClose={() => setEditor(null)} />}
  </section>;
}
