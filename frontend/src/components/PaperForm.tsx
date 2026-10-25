import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Form, Input, InputNumber, Popconfirm, Select, Space, Spin, Switch, Tag, Upload } from 'antd';
import { api, ApiError, errorMessage } from '../api/client';
import type { PaperDetail, PaperInput, PdfExtraction, TagSummary } from '../types/api';
import { readingOptions, safeExternalUrl } from '../utils/papers';

const emptyPaper: PaperInput = {
  title: '', authors: '', year: null, venue: '', doi: null, url: null, abstract: '',
  research_topic: '', reading_status: 'not_started', is_favorite: false, tag_ids: [],
};

export function PaperForm({ paper, tags, onSave, onCancel }: {
  paper: PaperDetail | null; tags: TagSummary[];
  onSave: (values: PaperInput, file?: File) => Promise<void>; onCancel: () => void;
}) {
  const [form] = Form.useForm<PaperInput>();
  const { modal } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File>();
  const [parsing, setParsing] = useState(false);
  const [extraction, setExtraction] = useState<PdfExtraction>();
  const [parseError, setParseError] = useState('');
  const [filled, setFilled] = useState<string[]>([]);
  const parseController = useRef<AbortController | null>(null);
  useEffect(() => () => parseController.current?.abort(), []);
  const fieldLabels: Record<string, string> = { title: '标题', authors: '作者', year: '年份', doi: 'DOI', abstract: '摘要' };
  const maxYear = new Date().getUTCFullYear() + 1;
  const initial = paper ? { ...paper, tag_ids: paper.tags.map((tag) => tag.id) } : emptyPaper;

  async function parseFile(selected: File) {
    if (!selected.name.toLowerCase().endsWith('.pdf') || (selected.type && selected.type !== 'application/pdf')) {
      setParseError('论文原文仅支持 PDF 文件。'); return;
    }
    if (!selected.size || selected.size > 25 * 1024 * 1024) { setParseError('请选择非空且不超过 25 MB 的 PDF。'); return; }
    parseController.current?.abort();
    const controller = new AbortController();
    parseController.current = controller;
    setFile(selected); setParsing(true); setExtraction(undefined); setParseError(''); setFilled([]);
    try {
      const result = await api.files.parse(selected, controller.signal);
      if (controller.signal.aborted) return;
      setExtraction(result);
      // 不覆盖已有文献信息或用户输入。候选值仍在识别卡片中可查看。
      const values: Partial<PaperInput> = {};
      for (const key of ['title', 'authors', 'year', 'doi', 'abstract'] as const) {
        const value = result.fields[key];
        if (value && !form.getFieldValue(key)) Object.assign(values, { [key]: value });
      }
      form.setFieldsValue(values); setFilled(Object.keys(values));
    } catch (reason) {
      if (!controller.signal.aborted) {
        setParseError(errorMessage(reason));
        if (reason instanceof ApiError && reason.status < 500) setFile(undefined);
      }
    } finally { if (!controller.signal.aborted) setParsing(false); }
  }

  async function submit(values: PaperInput) {
    if (saving || parsing) return;
    setSaving(true);
    setError('');
    if (file && paper?.paper_file) {
      const confirmed = await modal.confirm({ title: '替换论文原文？', content: '保存后原 PDF 将被新文件替换，文献信息也会一并保存。', okText: '确认替换并保存', cancelText: '继续编辑' });
      if (!confirmed) { setSaving(false); return; }
    }
    // 明确构造可写字段，防止把详情中的 id、时间戳、笔记等只读字段传给后端。
    const body: PaperInput = {
      title: values.title.trim(), authors: (values.authors ?? '').trim(), year: values.year ?? null,
      venue: (values.venue ?? '').trim(), doi: values.doi?.trim() || null, url: values.url?.trim() || null,
      abstract: (values.abstract ?? '').trim(), research_topic: (values.research_topic ?? '').trim(),
      reading_status: values.reading_status, is_favorite: values.is_favorite, tag_ids: values.tag_ids ?? [],
    };
    try { await onSave(body, file); }
    catch (reason) {
      const message = errorMessage(reason);
      setError(message);
      if (reason instanceof ApiError && (reason.details.field === 'title' || reason.details.field === 'doi')) {
        form.setFields([{ name: reason.details.field, errors: [message] }]);
        form.scrollToField(reason.details.field);
      }
    } finally { setSaving(false); }
  }

  return <div className="capture-layout"><section className="capture-source">
    <div className="capture-step"><h2>论文原文</h2><small>可选</small></div>
    <Upload.Dragger accept=".pdf,application/pdf" multiple={false} showUploadList={false} disabled={saving || parsing}
      beforeUpload={(selected) => { void parseFile(selected); return false; }}>
      <div className="pdf-glyph" aria-hidden="true">PDF<span>↗</span></div>
      <h3>{parsing ? '正在解析论文…' : file ? '已选择 PDF' : '拖入论文 PDF'}</h3>
      <p>{file?.name || paper?.paper_file?.filename || '拖入 PDF，或点击选择文件'}</p>
      <small>PDF · 最大 25 MB · 可跳过</small>
    </Upload.Dragger>
    {parsing && <div className="parse-status" role="status"><Spin size="small" /> 正在识别标题、作者、年份、DOI 和摘要</div>}
    {parseError && <Alert className="parse-status" type="warning" showIcon title="解析未完成" description={<>{parseError}{file && <Button type="link" onClick={() => parseFile(file)}>重新解析</Button>}</>} />}
    {extraction && <div className="extraction-card" role="status"><h3>识别结果 · 请检查后保存</h3>
      <Space wrap>{extraction.recognized.map((key) => <Tag color="green" key={key}>已识别{fieldLabels[key]}</Tag>)}</Space>
      <p>未识别：{extraction.missing.map((key) => fieldLabels[key]).join('、') || '无'}</p>
      <p className="muted">已预填：{filled.map((key) => fieldLabels[key]).join('、') || '无'}。已有内容会保留。</p>
      {extraction.warning && <p>{extraction.warning}</p>}
      <details><summary>查看提取的候选信息</summary>{Object.entries(extraction.fields).map(([key, value]) => <p className="break-text" key={key}><strong>{fieldLabels[key]}：</strong>{value || '未识别'}</p>)}</details>
    </div>}
    {file && <Popconfirm title="取消这次文件选择？" description="已预填的文字会保留；已有论文原文不会被删除。" onConfirm={() => { setFile(undefined); setExtraction(undefined); setParseError(''); }} okText="取消选择" cancelText="保留">
      <Button disabled={saving || parsing} className="parse-status">取消文件选择</Button></Popconfirm>}
    <p className="capture-hint">文件将在保存时绑定这篇文献。{paper?.paper_file ? '选择新 PDF 并保存后，将替换原文件。' : '没有 PDF，也可以从一个标题开始。'}</p>
  </section><Card className="capture-form"><div className="capture-step"><h2>文献信息</h2></div>
    <Form form={form} layout="vertical" initialValues={initial} onFinish={submit}
    disabled={saving || parsing} onValuesChange={() => setError('')} scrollToFirstError>
    {error && <Alert className="form-alert" type="error" showIcon title="保存失败" description={error} />}
    <Form.Item label="标题" name="title" rules={[{ required: true, whitespace: true, message: '请输入文献标题' }, { max: 500 }]}>
      <Input maxLength={500} placeholder="文献的完整标题" />
    </Form.Item>
    <Form.Item label="作者" name="authors" rules={[{ max: 1000 }]}>
      <Input maxLength={1000} placeholder="选填，多位作者可用分号分隔" />
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
      <Form.Item label="阅读状态" name="reading_status" extra={paper?.reading_status === 'completed' ? '已读完状态会保留。' : paper?.paper_file || file ? 'PDF 阅读时自动更新状态。' : '无 PDF 时可手动记录状态。'}>
        <Select options={readingOptions} disabled={!!paper?.paper_file || !!file || paper?.reading_status === 'completed'} /></Form.Item>
      <Form.Item label="收藏" name="is_favorite" valuePropName="checked"><Switch checkedChildren="已收藏" unCheckedChildren="未收藏" /></Form.Item>
    </div>
    <div className="capture-actions"><Space><Button type="primary" htmlType="submit" loading={saving}>保存文献</Button><Button onClick={onCancel}>取消</Button></Space>
      </div>
  </Form></Card></div>;
}
