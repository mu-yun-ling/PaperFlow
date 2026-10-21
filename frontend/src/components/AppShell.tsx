import type { ReactNode } from 'react';
import { Tag } from 'antd';
import { useRoute } from '../routing';

export function AppShell({ children }: { children: ReactNode }) {
  const route = useRoute();
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="#/papers" aria-label="PaperFlow 首页">
          <span className="brand-symbol" aria-hidden="true">P<span>.</span></span>
          <span>PaperFlow<small>让阅读留下积累</small></span>
        </a>
        <Tag variant="filled" color="green">个人文献空间</Tag>
      </header>
      <nav className="app-nav" aria-label="主导航">
        <a href="#/papers" aria-current={route.page !== 'tags' ? 'page' : undefined}>文献库</a>
        <a href="#/tags" aria-current={route.page === 'tags' ? 'page' : undefined}>标签管理</a>
      </nav>
      <main>{children}</main>
      <footer>PaperFlow <span>文献 · 思考 · 连接</span></footer>
    </div>
  );
}
