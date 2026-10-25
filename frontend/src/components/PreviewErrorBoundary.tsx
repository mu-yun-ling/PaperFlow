import { Component, type ReactNode } from 'react';
import { Alert, Button } from 'antd';

/** 懒加载模块失联时保留可操作提示，避免整个页面或阅读窗口变成空白。 */
export class PreviewErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <Alert className="preview-load-error" type="error" showIcon title="页面组件加载失败"
      description="本机服务可能已停止，或页面资源已更新。确认前后端已启动后，重新加载页面。"
      action={<Button onClick={() => window.location.reload()}>重新加载页面</Button>} />;
    return this.props.children;
  }
}
