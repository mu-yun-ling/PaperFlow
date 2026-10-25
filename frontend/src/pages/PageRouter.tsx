import { lazy, Suspense, useEffect } from 'react';
import { Button, Result, Skeleton } from 'antd';
import { useRoute } from '../routing';

const PaperListPage = lazy(() => import('./PaperListPage').then((module) => ({ default: module.PaperListPage })));
const PaperFormPage = lazy(() => import('./PaperFormPage').then((module) => ({ default: module.PaperFormPage })));
const PaperDetailPage = lazy(() => import('./PaperDetailPage').then((module) => ({ default: module.PaperDetailPage })));
const TagsPage = lazy(() => import('./TagsPage').then((module) => ({ default: module.TagsPage })));
const OverviewPage = lazy(() => import('./OverviewPage').then((module) => ({ default: module.OverviewPage })));
const AISettingsPage = lazy(() => import('./AISettingsPage').then((module) => ({ default: module.AISettingsPage })));

export function PageRouter() {
  return <Suspense fallback={<div className="page-loading"><Skeleton active /></div>}><CurrentPage /></Suspense>;
}

function CurrentPage() {
  const route = useRoute();
  const routeKey = `${route.page}-${'id' in route ? route.id : ''}`;
  useEffect(() => { window.scrollTo(0, 0); }, [routeKey]);
  switch (route.page) {
    case 'papers': return <PaperListPage />;
    case 'new': return <PaperFormPage key="new" />;
    case 'edit': return <PaperFormPage key={`edit-${route.id}`} id={route.id} />;
    case 'detail': return <PaperDetailPage key={route.id} id={route.id} />;
    case 'tags': return <TagsPage />;
    case 'dashboard': return <OverviewPage />;
    case 'ai-settings': return <AISettingsPage />;
    default: return <Result status="404" title="页面不存在" extra={<Button href="#/papers">返回文献列表</Button>} />;
  }
}
