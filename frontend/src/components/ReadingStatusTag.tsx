import { Tag } from 'antd';
import type { ReadingStatus } from '../types/api';
import { readingOptions } from '../utils/papers';

export function ReadingStatusTag({ status }: { status: ReadingStatus }) {
  return <Tag className={`reading-status status-${status}`}>
    {readingOptions.find((option) => option.value === status)?.label ?? status}
  </Tag>;
}
