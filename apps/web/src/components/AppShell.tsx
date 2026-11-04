import { useMemo, type ReactNode } from 'react';
import { Avatar, Button, Layout, Menu, Tag } from 'antd';
import {
  AppstoreOutlined,
  BarChartOutlined,
  CalendarOutlined,
  CheckSquareOutlined,
  DashboardOutlined,
  FolderOutlined,
  LineChartOutlined,
  LogoutOutlined,
  ProjectOutlined,
  SettingOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { designVars } from '../styles/theme';

const { Sider, Header, Content } = Layout;

/**
 * 左侧导航 10 项（老六最终用户端界面）：
 * 项目总览 / 项目看板 / 任务清单 / 日程安排 / 进度追踪 /
 * 团队协作 / 文件资料 / 风险问题 / 数据统计 / 设置。
 *
 * `key` 是菜单选中项与跳转目标；`match` 是用于高亮的路径前缀。
 * 「项目总览」是根路径（/），单独用 exact 判定，避免把 /tasks 也高亮上。
 */
interface NavItem {
  key: string;
  match: string;
  icon: ReactNode;
  label: string;
  /** 路径完全相等才算命中（根路径用） */
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { key: '/', match: '/', exact: true, icon: <DashboardOutlined />, label: '项目总览' },
  { key: '/kanban', match: '/kanban', icon: <ProjectOutlined />, label: '项目看板' },
  { key: '/tasks', match: '/tasks', icon: <CheckSquareOutlined />, label: '任务清单' },
  { key: '/calendar', match: '/calendar', icon: <CalendarOutlined />, label: '日程安排' },
  { key: '/progress', match: '/progress', icon: <LineChartOutlined />, label: '进度追踪' },
  { key: '/team', match: '/team', icon: <TeamOutlined />, label: '团队协作' },
  { key: '/files', match: '/files', icon: <FolderOutlined />, label: '文件资料' },
  { key: '/risks', match: '/risks', icon: <WarningOutlined />, label: '风险问题' },
  { key: '/analytics', match: '/analytics', icon: <BarChartOutlined />, label: '数据统计' },
  { key: '/settings/password', match: '/settings', icon: <SettingOutlined />, label: '设置' },
];

/**
 * 管理员专属入口（老六设计稿的 10 项之外）。
 * 工作台 / 项目管理 是管理员与高级功能，普通用户不显示入口，直接访问走 403。
 */
const ADMIN_NAV_ITEMS: NavItem[] = [
  { key: '/workspace', match: '/workspace', icon: <AppstoreOutlined />, label: '工作台' },
  { key: '/projects', match: '/projects', icon: <FolderOutlined />, label: '项目管理' },
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
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // 按路径前缀高亮当前导航项；/settings/* 下的所有子页都高亮「设置」
  const selectedKey = useMemo(() => {
    const all = isAdmin ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : NAV_ITEMS;
    const hit = all.find((item) =>
      item.exact
        ? location.pathname === item.key
        : location.pathname === item.match || location.pathname.startsWith(`${item.match}/`),
    );
    return hit?.key ?? '/';
  }, [location.pathname, isAdmin]);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      void navigate('/login', { replace: true });
    }
  };

  const navItems = isAdmin ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : NAV_ITEMS;

  // AntD Menu 只认 key / icon / label，多余的 match、exact 不传进去
  const menuItems = navItems.map((item) => ({
    key: item.key,
    icon: item.icon,
    label: item.label,
  }));

  return (
    <Layout className="wb-layout">
      <Sider width={designVars.siderWidth} className="wb-sider" theme="light">
        <div className="wb-brand">
          <span className="wb-brand-mark" aria-hidden="true">
            项
          </span>
          <span className="wb-brand-name">项目管理</span>
        </div>
        <Menu
          theme="light"
          mode="inline"
          className="wb-sider-menu"
          selectedKeys={[selectedKey]}
          items={menuItems}
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
