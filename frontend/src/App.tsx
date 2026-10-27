import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AppShell } from './components/AppShell';
import { PageRouter } from './pages/PageRouter';
import { PreviewErrorBoundary } from './components/PreviewErrorBoundary';

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={{ token: {
      colorPrimary: '#355f4c', borderRadius: 6, colorText: '#2c4035',
      colorSuccess: '#779f7c', colorInfo: '#779bab', colorWarning: '#cda65e',
      colorBorder: '#e3e9dd', colorBgLayout: '#f5f6f0', controlHeight: 34,
      fontFamily: 'Inter, "Segoe UI", "Microsoft YaHei", sans-serif',
    }, components: { Progress: { defaultColor: '#527c62', remainingColor: '#e6ebe2' } } }}>
      <AntApp><AppShell><PreviewErrorBoundary><PageRouter /></PreviewErrorBoundary></AppShell></AntApp>
    </ConfigProvider>
  );
}
