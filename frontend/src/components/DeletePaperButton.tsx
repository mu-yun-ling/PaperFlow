import { useState } from 'react';
import { App, Button, Popconfirm } from 'antd';
import { api, errorMessage } from '../api/client';

export function DeletePaperButton({ id, onDeleted, disabled = false }: {
  id: number; onDeleted: () => void; disabled?: boolean;
}) {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await api.papers.delete(id);
      setOpen(false);
      message.success('文献已删除');
      onDeleted();
    } catch (error) { message.error(errorMessage(error)); }
    finally { setBusy(false); }
  }

  return <Popconfirm title="删除这篇文献？" description="关联笔记也会删除，标签本身会保留。此操作无法撤销。"
    open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }} onConfirm={remove}
    onCancel={() => setOpen(false)} okText="确认删除" cancelText="取消"
    okButtonProps={{ danger: true, loading: busy }} cancelButtonProps={{ disabled: busy }}>
    <Button danger size="small" disabled={disabled} loading={busy}>删除</Button>
  </Popconfirm>;
}
