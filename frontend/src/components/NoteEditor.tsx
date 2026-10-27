import { useState } from 'react';
import { Alert, Form, Input, Modal, Segmented } from 'antd';
import { errorMessage } from '../api/client';
import type { Note } from '../types/api';
import { MarkdownView } from './MarkdownView';

export function NoteEditor({ note, onSave, onClose, onSavingChange }: {
  note: Note | null; onSave: (content: string) => Promise<void>; onClose: () => void; onSavingChange?: (saving: boolean) => void;
}) {
  const [form] = Form.useForm<{ content: string }>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<string>('编辑');
  const content = Form.useWatch('content', form) ?? note?.content ?? '';

  async function submit(values: { content: string }) {
    if (saving) return;
    setSaving(true);
    onSavingChange?.(true);
    setError('');
    try { await onSave(values.content.trim()); onClose(); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setSaving(false); onSavingChange?.(false); }
  }

  return <Modal open title={note ? '编辑笔记' : '新建笔记'} okText="保存笔记" cancelText="取消" width={960}
    onOk={() => form.submit()} onCancel={onClose} confirmLoading={saving} closable={!saving}
    mask={{ closable: !saving }} keyboard={!saving} cancelButtonProps={{ disabled: saving }}>
    <Form form={form} layout="vertical" initialValues={{ content: note?.content ?? '' }} onFinish={submit} disabled={saving}
      onFinishFailed={() => { setMode('编辑'); setError('请填写笔记内容，最多 50000 个字符。'); }}>
      {error && <Alert className="form-alert" showIcon type="error" title="保存失败" description={error} />}
      <div className="editor-toolbar"><Segmented options={['编辑', '预览', '对照']} value={mode} onChange={setMode} /><span>Markdown + LaTeX · $行内公式$ / $$独立公式$$</span></div>
      <div className={`note-editor-layout ${mode === '对照' ? 'is-split' : ''}`}>
        <div style={{ display: mode === '预览' ? 'none' : undefined }}><Form.Item label="笔记内容" name="content"
          rules={[{ required: true, whitespace: true, message: '笔记内容不能为空' }, { max: 50000 }]}>
          <Input.TextArea className="markdown-input" rows={16} maxLength={50000} showCount
            placeholder={'## 核心观点\n\n记录研究问题、方法和结论…\n\n- [ ] 下一步：复现关键实验'} />
        </Form.Item></div>
        {mode !== '编辑' && <div className="editor-preview" aria-label="笔记预览">{content.trim() ? <MarkdownView content={content} /> : <p className="muted">写下内容后，在这里查看排版效果。</p>}</div>}
      </div>
    </Form>
  </Modal>;
}
