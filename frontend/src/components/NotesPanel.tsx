import { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Dropdown, Empty, Skeleton, Space } from 'antd';
import { api, errorMessage } from '../api/client';
import { useResource } from '../hooks/useResource';
import type { Note } from '../types/api';
import { formatTime } from '../utils/papers';
import { LoadError } from './LoadError';
import { NoteEditor } from './NoteEditor';
import { MarkdownView } from './MarkdownView';

export function NotesPanel({ paperId, compact = false, createRequest = 0, onCreateHandled, hideCreate = false, refreshVersion = 0 }: {
  paperId: number; compact?: boolean; createRequest?: number; onCreateHandled?: () => void; hideCreate?: boolean; refreshVersion?: number;
}) {
  const { message, modal } = App.useApp();
  const load = useCallback((signal: AbortSignal) => api.notes.list(paperId, signal), [paperId, refreshVersion]);
  const { data, error, loading, reload } = useResource(load);
  const [editor, setEditor] = useState<{ note: Note | null } | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  useEffect(() => { if (createRequest) { setEditor({ note: null }); onCreateHandled?.(); } }, [createRequest, onCreateHandled]);

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

  return <section className={`notes-section ${compact ? 'compact-notes' : ''}`} aria-label="阅读笔记">
    <div className="section-heading"><p className="section-description">Markdown + LaTeX{data?.length ? ` · ${data.length} 条笔记` : ''}</p>
      <Space><Button type="text" size="small" onClick={reload} loading={loading}>刷新</Button>
        {!hideCreate && <Button type="primary" onClick={() => setEditor({ note: null })} disabled={loading || !!error || deleting !== null}>新建笔记</Button>}</Space>
    </div>
    {loading ? <Skeleton active /> : error ? <LoadError error={error} retry={reload} /> : data?.length ?
      <div className="note-list">{data.map((note, index) => <Card key={note.id} className="note-card" size="small">
        {index === 0 && <div className="recent-note-label">最近笔记 <span>{formatTime(note.updated_at)}</span></div>}
        <MarkdownView content={note.content} />
        <div className="note-footer"><span className="muted">更新于 {formatTime(note.updated_at)}</span><Space>
          <Button type="text" size="small" onClick={() => setEditor({ note })} disabled={deleting !== null}>编辑笔记</Button>
          <Dropdown trigger={['click']} menu={{ items: [{ key: 'delete', label: '删除笔记', danger: true,
            onClick: () => modal.confirm({ title: '删除这条笔记？', content: '此操作无法撤销。', okText: '确认删除', cancelText: '取消',
              okButtonProps: { danger: true }, onOk: () => remove(note.id) }) }] }}>
            <Button type="text" size="small" aria-label="笔记更多操作" disabled={deleting !== null}>···</Button>
          </Dropdown>
        </Space></div>
      </Card>)}</div> : <Card><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有笔记，记下阅读中的第一个想法吧。" /></Card>}
    {editor && <NoteEditor note={editor.note} onSave={save} onClose={() => setEditor(null)} />}
  </section>;
}
