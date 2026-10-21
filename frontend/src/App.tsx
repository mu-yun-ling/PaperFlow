import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { AppShell } from './components/AppShell';
import { PageRouter } from './pages/PageRouter';

export default function App() {
  return (
    <ConfigProvider locale={zhCN} theme={{ token: {
      colorPrimary: '#245e4f', borderRadius: 12, colorText: '#233b34',
      fontFamily: 'Inter, "Segoe UI", "Microsoft YaHei", sans-serif',
    } }}>
      <AntApp><AppShell><PageRouter /></AppShell></AntApp>
    </ConfigProvider>
  );
}
