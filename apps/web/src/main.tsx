import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { RouterProvider } from 'react-router-dom';
import { router } from './App';
import { AuthProvider } from './auth/AuthContext';
import { antdTheme } from './styles/theme';
import './styles/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 认证接口 401 属于正常分支（AuthContext 内部已转成「无用户」），不重试
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

const container = document.getElementById('root');
if (!container) throw new Error('缺少 #root 挂载点');

createRoot(container).render(
  <StrictMode>
    <ConfigProvider locale={zhCN} theme={antdTheme}>
      <AntdApp>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  </StrictMode>,
);
