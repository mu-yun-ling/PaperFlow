import { Alert, Button, Space } from 'antd';
import { ApiError, errorMessage } from '../api/client';

export function LoadError({ error, retry }: { error: unknown; retry: () => void }) {
  const missing = error instanceof ApiError && error.status === 404;
  return <Alert type="error" showIcon title={missing ? '内容不存在或已被删除' : '加载失败'}
    description={errorMessage(error)} action={<Space wrap>
      <Button size="small" onClick={retry}>重试</Button>
      {missing && <Button size="small" href="#/papers">返回文献列表</Button>}
    </Space>} />;
}
