import { useState } from 'react';
import { Alert, Form, Input, Modal } from 'antd';
import { errorMessage } from '../api/client';
import type { Note } from '../types/api';

export function NoteEditor({ note, onSave, onClose }: {
  note: Note | null; onSave: (content: string) => Promise<void>; onClose: () => void;
}) {
  const [form] = Form.useForm<{ content: string }>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(values: { content: string }) {
    if (saving) return;
    setSaving(true);
    setError('');
    try { await onSave(values.content.trim()); onClose(); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); }
  }

  return <Modal open title={note ? '编辑笔记' : '新增笔记'} okText="保存笔记" cancelText="取消"
    onOk={() => form.submit()} onCancel={onClose} confirmLoading={saving} closable={!saving}
    mask={{ closable: !saving }} keyboard={!saving} cancelButtonProps={{ disabled: saving }}>
    <Form form={form} layout="vertical" initialValues={{ content: note?.content ?? '' }} onFinish={submit} disabled={saving}>
      {error && <Alert className="form-alert" showIcon type="error" title="保存失败" description={error} />}
      <Form.Item label="笔记内容" name="content" rules={[{ required: true, whitespace: true, message: '笔记内容不能为空' }, { max: 50000 }]}>
        <Input.TextArea rows={8} maxLength={50000} showCount placeholder="记录研究问题、方法、结论，或你的疑问。" />
      </Form.Item>
    </Form>
  </Modal>;
}
