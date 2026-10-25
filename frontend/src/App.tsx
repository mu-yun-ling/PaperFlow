import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AppShell } from './components/AppShell';
import { PageRouter } from './pages/PageRouter';
import { PreviewErrorBoundary } from './components/PreviewErrorBoundary';

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={{ token: {
      colorPrimary: '#2f6b57', borderRadius: 8, colorText: '#26352f',
      colorBorder: '#dfe5df', colorBgLayout: '#f7f8f5', controlHeight: 36,
      fontFamily: 'Inter, "Segoe UI", "Microsoft YaHei", sans-serif',
    } }}>
      <AntApp><AppShell><PreviewErrorBoundary><PageRouter /></PreviewErrorBoundary></AppShell></AntApp>
    </ConfigProvider>
  );
}
