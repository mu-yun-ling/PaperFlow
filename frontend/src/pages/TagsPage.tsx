import { useState } from 'react';
import { Alert, App, Button, Card, Empty, Form, Input, Popconfirm, Table } from 'antd';
import { api, errorMessage } from '../api/client';
import { LoadError } from '../components/LoadError';
import { useResource } from '../hooks/useResource';
import type { TagSummary } from '../types/api';

export function TagsPage() {
  const { message } = App.useApp();
  const { data, loading, error, reload } = useResource(api.tags.list);
  const [form] = Form.useForm<{ name: string }>();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [saveError, setSaveError] = useState('');

  async function create({ name }: { name: string }) {
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try { await api.tags.create(name.trim()); form.resetFields(); message.success('标签已创建'); reload(); }
    catch (reason) { setSaveError(errorMessage(reason)); }
    finally { setSaving(false); }
  }

  async function remove(id: number) {
    if (deleting !== null) return;
    setDeleting(id);
    try { await api.tags.delete(id); message.success('标签已删除'); reload(); }
    catch (reason) { message.error(errorMessage(reason)); }
    finally { setDeleting(null); }
  }

  return <>
    <div className="page-heading"><div><h1>标签管理</h1><p>用标签整理文献，同一篇文献可以属于多个标签。</p></div>
      <Button onClick={reload} loading={loading}>刷新标签</Button></div>
    <Card className="tag-create-card">
      <Form form={form} layout="vertical" onFinish={create} disabled={saving} onValuesChange={() => setSaveError('')}>
        <div className="tag-create-row"><Form.Item name="name" label="标签名称" rules={[{ required: true, whitespace: true, message: '请输入标签名称' }, { max: 50 }]}>
          <Input maxLength={50} placeholder="例如：深度学习" /></Form.Item>
          <Button type="primary" htmlType="submit" loading={saving} disabled={deleting !== null}>新增标签</Button></div>
        {saveError && <Alert type="error" showIcon title="创建失败" description={saveError} />}
      </Form>
    </Card>
    {error ? <LoadError error={error} retry={reload} /> : <Table<TagSummary> rowKey="id" loading={loading} dataSource={data ?? []}
      pagination={{ pageSize: 20, hideOnSinglePage: true, showSizeChanger: false }}
      locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有标签，在上方创建一个吧。" /> }}
      columns={[
        { title: '标签名称', dataIndex: 'name', render: (name: string) => <span className="break-text">{name}</span> },
        { title: '关联文献', dataIndex: 'paper_count', width: 110 },
        { title: '操作', width: 100, render: (_, tag) => <Popconfirm title={`删除标签“${tag.name}”？`}
          description="会移除所有文献上的此标签，文献和笔记会保留。" okText="确认删除" cancelText="取消" onConfirm={() => remove(tag.id)}
          okButtonProps={{ danger: true, loading: deleting === tag.id }}>
          <Button danger size="small" loading={deleting === tag.id} disabled={saving || deleting !== null || loading}>删除标签</Button>
        </Popconfirm> },
      ]} />}
  </>;
}
