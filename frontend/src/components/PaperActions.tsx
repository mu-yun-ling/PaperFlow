import { useState } from 'react';
import { App, Button, Dropdown } from 'antd';
import { api, errorMessage } from '../api/client';

export function PaperActions({ id, onDeleted, disabled = false }: { id: number; onDeleted: () => void; disabled?: boolean }) {
  const { message, modal } = App.useApp();
  const [busy, setBusy] = useState(false);
  function confirm() {
    modal.confirm({ title: '删除这篇文献？', content: '论文原文、在线笔记及笔记附件会一并删除。此操作无法撤销。',
      okText: '确认删除', cancelText: '取消', okButtonProps: { danger: true }, onOk: async () => {
        setBusy(true);
        try { await api.papers.delete(id); message.success('文献已删除'); onDeleted(); }
        catch (reason) { message.error(errorMessage(reason)); throw reason; }
        finally { setBusy(false); }
      } });
  }
  return <Dropdown trigger={['click']} menu={{ items: [
    { key: 'edit', label: <a href={`#/papers/${id}/edit`}>编辑文献</a> },
    { key: 'delete', label: '删除文献', danger: true, onClick: confirm },
  ] }}><Button type="text" aria-label="文献更多操作" disabled={disabled || busy} loading={busy}>···</Button></Dropdown>;
}
