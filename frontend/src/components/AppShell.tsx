import type { ReactNode } from 'react';
import { useRoute } from '../routing';
import { Icon } from './Icon';

export function AppShell({ children }: { children: ReactNode }) {
  const route = useRoute();
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="#/dashboard" aria-label="PaperFlow 首页">
          <span className="brand-symbol" aria-hidden="true">P<span>.</span></span>
          <span>PaperFlow</span>
        </a>
      <nav className="app-nav" aria-label="主导航">
        <a href="#/dashboard" aria-current={route.page === 'dashboard' ? 'page' : undefined}><Icon name="home" />首页</a>
        <a href="#/papers" aria-current={['papers', 'new', 'edit', 'detail'].includes(route.page) ? 'page' : undefined}><Icon name="library" />文献库</a>
        <a href="#/tags" aria-current={route.page === 'tags' ? 'page' : undefined}><Icon name="tag" />标签管理</a>
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-note"><span>慢慢读，深深想。</span><small>留一点时间，给新的发现。</small></div><a href="#/settings/ai" aria-current={route.page === 'ai-settings' ? 'page' : undefined}><Icon name="settings" />AI 设置</a><span className="sidebar-signature">YOUR PERSONAL READING SPACE</span></div>
      </header>
      <div className="app-content"><div className="workspace-topbar"><span>我的阅读工作台 <span className="topbar-divider">/</span> <strong>{route.page === 'dashboard' ? '首页' : route.page === 'tags' ? '标签管理' : route.page === 'ai-settings' ? '偏好设置' : '文献库'}</strong></span><div className="workspace-identity"><span className="workspace-dot" />个人空间<span className="profile-avatar" aria-label="个人阅读空间">P</span></div></div><main>{children}</main><footer>PaperFlow <span>文献 · 思考 · 连接</span></footer></div>
    </div>
  );
}
