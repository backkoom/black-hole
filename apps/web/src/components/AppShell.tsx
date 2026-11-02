import { useMemo } from 'react';
import { Avatar, Button, Layout, Menu, Tag } from 'antd';
import {
  AppstoreOutlined,
  CheckSquareOutlined,
  FolderOutlined,
  LogoutOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { designVars } from '../styles/theme';

const { Sider, Header, Content } = Layout;

/**
 * 左侧导航四项（pages.md §App Shell：工作台 / 任务管理 / 项目管理 / 设置）。
 * `key` 是菜单选中项与跳转目标，`match` 是用于高亮的路径前缀。
 */
const NAV_ITEMS = [
  { key: '/workspace', match: '/workspace', icon: <AppstoreOutlined />, label: '工作台' },
  { key: '/tasks', match: '/tasks', icon: <CheckSquareOutlined />, label: '任务管理' },
  { key: '/projects', match: '/projects', icon: <FolderOutlined />, label: '项目管理' },
  { key: '/settings/password', match: '/settings', icon: <SettingOutlined />, label: '设置' },
];

/** 角色标签（shared/types.ts：角色只有 admin / user，另有 isSuper 标记超管）。 */
function roleLabel(role: string, isSuper: boolean): string {
  if (isSuper) return '超级管理员';
  return role === 'admin' ? '管理员' : '普通用户';
}

/**
 * App Shell —— 左侧固定导航 + 顶部栏（pages.md §App Shell）。
 * 顶部栏只显示当前用户名、角色标签与退出，不显示搜索 / 通知 / AI。
 */
export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // 按路径前缀高亮当前导航项；/settings/* 下的所有子页都高亮「设置」
  const selectedKey = useMemo(
    () => NAV_ITEMS.find((item) => location.pathname.startsWith(item.match))?.key ?? '/workspace',
    [location.pathname],
  );

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      void navigate('/login', { replace: true });
    }
  };

  return (
    <Layout className="wb-layout">
      <Sider width={designVars.siderWidth} className="wb-sider" theme="dark">
        <div className="wb-brand">
          <span className="wb-brand-mark" aria-hidden="true">
            工
          </span>
          <span className="wb-brand-name">工作台</span>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          className="wb-sider-menu"
          selectedKeys={[selectedKey]}
          items={NAV_ITEMS}
          onClick={({ key }) => void navigate(key)}
        />
      </Sider>

      <Layout className="wb-main">
        <Header className="wb-header">
          <div className="wb-header-right">
            {user ? (
              <>
                <Avatar size={30} className="wb-avatar">
                  {user.name.slice(0, 1)}
                </Avatar>
                <span className="wb-user-name">{user.name}</span>
                <Tag className="wb-role-tag">{roleLabel(user.role, user.isSuper)}</Tag>
              </>
            ) : null}
            <Button type="text" icon={<LogoutOutlined />} onClick={() => void handleLogout()}>
              退出
            </Button>
          </div>
        </Header>

        <Content className="wb-content">
          <div className="wb-content-inner">
            <Outlet />
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}
