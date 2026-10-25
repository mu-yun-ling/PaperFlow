import { useCallback } from 'react';
import { App, Skeleton } from 'antd';
import { api } from '../api/client';
import { useResource } from '../hooks/useResource';
import { LoadError } from '../components/LoadError';
import { PaperForm } from '../components/PaperForm';
import { navigate } from '../routing';
import type { PaperInput } from '../types/api';

export function PaperFormPage({ id }: { id?: number }) {
  const { message } = App.useApp();
  const load = useCallback(async (signal: AbortSignal) => {
    const [paper, tags] = await Promise.all([id ? api.papers.get(id, signal) : Promise.resolve(null), api.tags.list(signal)]);
    return { paper, tags };
  }, [id]);
  const { data, loading, error, reload } = useResource(load);

  async function save(values: PaperInput, file?: File) {
    const paper = id ? await api.papers.update(id, values, file) : await api.papers.create(values, file);
    message.success(id ? '文献已更新' : '文献已添加');
    navigate(`/papers/${paper.id}`);
  }

  return <>
    <div className="page-heading"><div><h1>{id ? '编辑文献' : '新增文献'}</h1>
      <p>上传 PDF 自动整理信息，也可以直接填写。只有标题必填。</p></div></div>
    {loading ? <Skeleton active paragraph={{ rows: 8 }} /> : error ? <LoadError error={error} retry={reload} /> : data &&
      <PaperForm paper={data.paper} tags={data.tags} onSave={save} onCancel={() => navigate(id ? `/papers/${id}` : '/papers')} />}
  </>;
}
