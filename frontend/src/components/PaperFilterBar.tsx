import { useState } from 'react';
import { Alert, Button, Checkbox, Form, Input, Select, Tag } from 'antd';
import { api, errorMessage } from '../api/client';
import { useResource } from '../hooks/useResource';
import type { FilterValues } from '../utils/paperFilters';
import { readingOptions } from '../utils/papers';
import { Icon } from './Icon';

export function PaperFilterBar({ values, onChange, onClear, invalidYear }: {
  values: FilterValues; onChange: (values: FilterValues) => void; onClear: () => void; invalidYear?: string;
}) {
  const tags = useResource(api.tags.list);
  const [expanded, setExpanded] = useState(false);
  const extraCount = [values.author, values.research_topic].filter(Boolean).length;
  function change(patch: Partial<FilterValues>) { onChange({ ...values, ...patch }); }
  return <section className="paper-filter-card">
    <Form layout="vertical" component="div" aria-label="文献搜索与筛选">
      <div className="filter-primary-row">
        <Form.Item label="标题搜索" htmlFor="filter-title"><Input id="filter-title" prefix={<Icon name="search" size={16} />} allowClear maxLength={500} placeholder="搜索文献标题…" value={values.title ?? ''} onChange={event => change({ title: event.target.value })} /></Form.Item>
        <Form.Item label="阅读状态筛选" htmlFor="filter-status"><Select id="filter-status" allowClear placeholder="全部状态" options={readingOptions} value={values.reading_status} onChange={reading_status => change({ reading_status })} /></Form.Item>
        <Form.Item label="标签筛选" htmlFor="filter-tag"><Select id="filter-tag" allowClear placeholder="全部标签" value={values.tag_id} onChange={tag_id => change({ tag_id })} loading={tags.loading} disabled={!!tags.error} options={(tags.data ?? []).map(tag => ({ label: tag.name, value: tag.id }))} /></Form.Item>
        <Form.Item label="年份筛选" htmlFor="filter-year" validateStatus={invalidYear ? 'error' : undefined} help={invalidYear}><Input id="filter-year" inputMode="numeric" allowClear placeholder="全部年份" value={values.year ?? ''} onChange={event => change({ year: event.target.value })} aria-invalid={!!invalidYear} /></Form.Item>
        <Button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '收起筛选' : `更多筛选${extraCount ? ` · ${extraCount}` : ''}`}</Button>
        <Button type="text" onClick={onClear}>重置</Button>
      </div>
      <div className="filter-sort-row"><span>排序方式</span>
        <Select aria-label="排序字段" value={values.sort_by} onChange={sort_by => change({ sort_by })} options={[{ label: '收录时间', value: 'created_at' }, { label: '最近更新', value: 'updated_at' }, { label: '出版年份', value: 'year' }]} />
        <Select aria-label="排序方向" value={values.sort_order} onChange={sort_order => change({ sort_order })} options={[{ label: '从新到旧', value: 'desc' }, { label: '从旧到新', value: 'asc' }]} />
      </div>
      <div className="filter-extra-row"><Checkbox checked={values.is_favorite === true} onChange={event => change({ is_favorite: event.target.checked ? true : undefined })}>只看收藏</Checkbox>{values.title && <Tag closable onClose={() => change({ title: '' })}>标题：{values.title}</Tag>}{values.author && <Tag closable onClose={() => change({ author: '' })}>作者：{values.author}</Tag>}{values.tag_id && <Tag closable onClose={() => change({ tag_id: undefined })}>{tags.data?.find(tag => tag.id === values.tag_id)?.name || '已选标签'}</Tag>}{values.year && <Tag closable onClose={() => change({ year: '' })}>{values.year} 年</Tag>}{values.reading_status && <Tag closable onClose={() => change({ reading_status: undefined })}>{readingOptions.find(item => item.value === values.reading_status)?.label}</Tag>}{values.research_topic && <Tag closable onClose={() => change({ research_topic: '' })}>{values.research_topic}</Tag>}</div>
      <div className="paper-filter-grid filter-secondary" hidden={!expanded}>
        <Form.Item label="作者搜索" htmlFor="filter-author"><Input id="filter-author" allowClear maxLength={1000} placeholder="输入作者姓名" value={values.author ?? ''} onChange={event => change({ author: event.target.value })} /></Form.Item>
        <Form.Item label="研究主题筛选" htmlFor="filter-topic"><Input id="filter-topic" allowClear maxLength={200} placeholder="输入完整主题（精确匹配）" value={values.research_topic ?? ''} onChange={event => change({ research_topic: event.target.value })} /></Form.Item>
      </div>
      {!!tags.error && <Alert type="warning" title="标签加载失败" description={errorMessage(tags.error)} action={<Button size="small" onClick={tags.reload}>重试标签</Button>} />}
    </Form>
  </section>;
}
