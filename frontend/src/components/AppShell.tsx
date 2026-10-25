import type { ReactNode } from 'react';
import { useRoute } from '../routing';

export function AppShell({ children }: { children: ReactNode }) {
  const route = useRoute();
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="#/papers" aria-label="PaperFlow 首页">
          <span className="brand-symbol" aria-hidden="true">P<span>.</span></span>
          <span>PaperFlow</span>
        </a>
      <nav className="app-nav" aria-label="主导航">
        <a href="#/papers" aria-current={['papers', 'new', 'edit', 'detail'].includes(route.page) ? 'page' : undefined}>文献库</a>
        <a href="#/tags" aria-current={route.page === 'tags' ? 'page' : undefined}>标签管理</a>
        <a href="#/dashboard" aria-current={route.page === 'dashboard' ? 'page' : undefined}>阅读概览</a>
      </nav>
      </header>
      <main>{children}</main>
      <footer>PaperFlow <span>文献 · 思考 · 连接</span></footer>
    </div>
  );
}
