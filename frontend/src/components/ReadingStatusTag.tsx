import { Tag } from 'antd';
import type { ReadingStatus } from '../types/api';
import { readingOptions } from '../utils/papers';

export function ReadingStatusTag({ status }: { status: ReadingStatus }) {
  return <Tag color={status === 'completed' ? 'green' : status === 'reading' ? 'blue' : 'default'}>
    {readingOptions.find((option) => option.value === status)?.label ?? status}
  </Tag>;
}
