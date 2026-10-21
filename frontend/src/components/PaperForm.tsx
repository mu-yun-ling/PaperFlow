import { useState } from 'react';
import { Alert, Button, Card, Form, Input, InputNumber, Select, Space, Switch } from 'antd';
import { ApiError, errorMessage } from '../api/client';
import type { PaperDetail, PaperInput, TagSummary } from '../types/api';
import { readingOptions, safeExternalUrl } from '../utils/papers';

const emptyPaper: PaperInput = {
  title: '', authors: '', year: null, venue: '', doi: null, url: null, abstract: '',
  research_topic: '', reading_status: 'not_started', is_favorite: false, tag_ids: [],
};

export function PaperForm({ paper, tags, onSave, onCancel }: {
  paper: PaperDetail | null; tags: TagSummary[];
  onSave: (values: PaperInput) => Promise<void>; onCancel: () => void;
}) {
  const [form] = Form.useForm<PaperInput>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const maxYear = new Date().getUTCFullYear() + 1;
  const initial = paper ? { ...paper, tag_ids: paper.tags.map((tag) => tag.id) } : emptyPaper;

  async function submit(values: PaperInput) {
    if (saving) return;
    setSaving(true);
    setError('');
    // 明确构造可写字段，防止把详情中的 id、时间戳、笔记等只读字段传给后端。
    const body: PaperInput = {
      title: values.title.trim(), authors: values.authors.trim(), year: values.year ?? null,
      venue: (values.venue ?? '').trim(), doi: values.doi?.trim() || null, url: values.url?.trim() || null,
      abstract: (values.abstract ?? '').trim(), research_topic: (values.research_topic ?? '').trim(),
      reading_status: values.reading_status, is_favorite: values.is_favorite, tag_ids: values.tag_ids ?? [],
    };
    try { await onSave(body); }
    catch (reason) {
      const message = errorMessage(reason);
      setError(message);
      if (reason instanceof ApiError && (reason.details.field === 'title' || reason.details.field === 'doi')) {
        form.setFields([{ name: reason.details.field, errors: [message] }]);
        form.scrollToField(reason.details.field);
      }
    } finally { setSaving(false); }
  }

  return <Card><Form form={form} layout="vertical" initialValues={initial} onFinish={submit}
    disabled={saving} onValuesChange={() => setError('')} scrollToFirstError>
    {error && <Alert className="form-alert" type="error" showIcon title="保存失败" description={error} />}
    <Form.Item label="标题" name="title" rules={[{ required: true, whitespace: true, message: '请输入文献标题' }, { max: 500 }]}>
      <Input maxLength={500} placeholder="文献的完整标题" />
    </Form.Item>
    <Form.Item label="作者" name="authors" rules={[{ required: true, whitespace: true, message: '请输入作者' }, { max: 1000 }]}>
      <Input maxLength={1000} placeholder="多位作者可用分号分隔" />
    </Form.Item>
    <div className="form-grid">
      <Form.Item label="年份" name="year" rules={[{ validator: (_, value: number | null) =>
        value == null || (Number.isInteger(value) && value >= 1000 && value <= maxYear)
          ? Promise.resolve() : Promise.reject(new Error(`请输入 1000 至 ${maxYear} 之间的整数`)) }]}>
        <InputNumber className="full-width" placeholder="可不填" controls={false} />
      </Form.Item>
      <Form.Item label="期刊 / 会议" name="venue" rules={[{ max: 500 }]}><Input maxLength={500} /></Form.Item>
      <Form.Item label="DOI" name="doi" rules={[{ max: 255 }]}><Input maxLength={255} placeholder="10.1000/example 或 DOI 链接" /></Form.Item>
      <Form.Item label="原文链接" name="url" rules={[{ max: 2048 }, { validator: (_, value: string | null) =>
        !value?.trim() || (safeExternalUrl(value.trim()) && !/\s/.test(value.trim()))
          ? Promise.resolve() : Promise.reject(new Error('请输入 HTTP 或 HTTPS 链接')) }]}>
        <Input maxLength={2048} placeholder="https://" />
      </Form.Item>
    </div>
    <Form.Item label="摘要" name="abstract" rules={[{ max: 50000 }]}><Input.TextArea rows={5} maxLength={50000} showCount /></Form.Item>
    <div className="form-grid">
      <Form.Item label="研究主题" name="research_topic" rules={[{ max: 200 }]}><Input maxLength={200} placeholder="例如：自然语言处理" /></Form.Item>
      <Form.Item label="标签" name="tag_ids" rules={[{ type: 'array', max: 100, message: '最多选择 100 个标签' }]}
        extra={tags.length ? '可为一篇文献选择多个标签。' : '暂无标签，可先保存文献，再到标签管理中创建标签。'}>
        <Select mode="multiple" showSearch={false} allowClear placeholder="选择标签" options={tags.map((tag) => ({ label: tag.name, value: tag.id }))}
          notFoundContent="暂无标签" />
      </Form.Item>
      <Form.Item label="阅读状态" name="reading_status"><Select options={readingOptions} /></Form.Item>
      <Form.Item label="收藏" name="is_favorite" valuePropName="checked"><Switch checkedChildren="已收藏" unCheckedChildren="未收藏" /></Form.Item>
    </div>
    <Space><Button type="primary" htmlType="submit" loading={saving}>保存文献</Button><Button onClick={onCancel}>取消</Button></Space>
  </Form></Card>;
}
