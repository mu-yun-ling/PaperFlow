import type { ReactNode } from 'react';
import { Tag } from 'antd';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="PaperFlow 首页">
          <span className="brand-symbol" aria-hidden="true">P<span>.</span></span>
          <span>PaperFlow<small>让阅读留下积累</small></span>
        </a>
        <Tag variant="filled" color="green">个人文献空间</Tag>
      </header>
      <main>{children}</main>
      <footer>PaperFlow <span>文献 · 思考 · 连接</span></footer>
    </div>
  );
}
