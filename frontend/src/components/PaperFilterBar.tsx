import { Alert, Button, Card, Form, Input, Select } from 'antd';
import { api, errorMessage } from '../api/client';
import { useResource } from '../hooks/useResource';
import type { FilterValues } from '../utils/paperFilters';
import { readingOptions } from '../utils/papers';

export function PaperFilterBar({ values, onChange, onClear, invalidYear }: {
  values: FilterValues;
  onChange: (values: FilterValues) => void;
  onClear: () => void;
  invalidYear?: string;
}) {
  const tags = useResource(api.tags.list);
  function change(patch: Partial<FilterValues>) { onChange({ ...values, ...patch }); }

  return <Card className="paper-filter-card" size="small">
    <Form layout="vertical" component="div" aria-label="文献搜索与筛选">
      <div className="paper-filter-grid">
        <Form.Item label="标题搜索" htmlFor="filter-title"><Input id="filter-title" allowClear maxLength={500}
          placeholder="输入标题关键词" value={values.title ?? ''} onChange={(event) => change({ title: event.target.value })} /></Form.Item>
        <Form.Item label="作者搜索" htmlFor="filter-author"><Input id="filter-author" allowClear maxLength={1000}
          placeholder="输入作者姓名" value={values.author ?? ''} onChange={(event) => change({ author: event.target.value })} /></Form.Item>
        <Form.Item label="标签筛选" htmlFor="filter-tag"><Select id="filter-tag" allowClear placeholder="全部标签"
          value={values.tag_id} onChange={(tag_id) => change({ tag_id })} loading={tags.loading} disabled={!!tags.error}
          options={(tags.data ?? []).map((tag) => ({ label: tag.name, value: tag.id }))}
          notFoundContent={tags.loading ? '加载标签中…' : '暂无标签'} /></Form.Item>
        <Form.Item label="年份筛选" htmlFor="filter-year" validateStatus={invalidYear ? 'error' : undefined} help={invalidYear}>
          <Input id="filter-year" inputMode="numeric" allowClear placeholder="例如：2024" value={values.year ?? ''}
            onChange={(event) => change({ year: event.target.value })} aria-invalid={!!invalidYear} />
        </Form.Item>
        <Form.Item label="阅读状态筛选" htmlFor="filter-status"><Select id="filter-status" allowClear placeholder="全部状态"
          options={readingOptions} value={values.reading_status} onChange={(reading_status) => change({ reading_status })} /></Form.Item>
        <Form.Item label="研究主题筛选" htmlFor="filter-topic"><Input id="filter-topic" allowClear maxLength={200}
          placeholder="输入完整主题（精确匹配）" value={values.research_topic ?? ''}
          onChange={(event) => change({ research_topic: event.target.value })} /></Form.Item>
        <Form.Item label="排序字段" htmlFor="filter-sort"><Select id="filter-sort" value={values.sort_by}
          onChange={(sort_by) => change({ sort_by })} options={[
            { label: '创建时间', value: 'created_at' }, { label: '更新时间', value: 'updated_at' }, { label: '年份', value: 'year' },
          ]} /></Form.Item>
        <Form.Item label="排序方向" htmlFor="filter-order"><Select id="filter-order" value={values.sort_order}
          onChange={(sort_order) => change({ sort_order })} options={[
            { label: '降序（从新到旧）', value: 'desc' }, { label: '升序（从旧到新）', value: 'asc' },
          ]} /></Form.Item>
      </div>
      <div className="filter-footer"><span className="muted">条件变更后自动查询；多个条件需同时满足。未填年份的文献在年份排序时置后。</span>
        <Button onClick={onClear}>清空筛选</Button></div>
      {!!tags.error && <Alert type="warning" showIcon title="标签加载失败" description={errorMessage(tags.error)}
        action={<Button size="small" onClick={tags.reload}>重试标签</Button>} />}
    </Form>
  </Card>;
}
