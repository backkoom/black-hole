import { useMemo, type ReactNode } from 'react';
import { Avatar, Button, Layout, Menu, Tag } from 'antd';
import type { MenuProps } from 'antd';
import {
  AppstoreOutlined,
  CalendarOutlined,
  ClusterOutlined,
  DashboardOutlined,
  FolderOpenOutlined,
  LogoutOutlined,
  SettingOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { designVars } from '../styles/theme';

const { Sider, Header, Content } = Layout;

/**
 * 左侧导航 —— 按**工作流分组**（2026-11-05 老六定的二期调整）。
 *
 * 之前 12 项平铺、三个"文件夹"图标撞车、管理员项混在末尾，扫一眼分不清。
 * 现在分三组 + 底部固定「设置」+ 管理员独立一组：
 *
 *   我的工作   项目总览 / 任务清单 / 日程安排      ← 每天进来先看自己的事
 *   项目协作   项目看板 / 团队协作 / 文件资料 / 风险问题
 *   数据洞察   进度追踪 / 数据统计
 *   ──────
 *   设置       始终贴底（不随滚动跑掉）
 *   系统管理   自定义工作台 / 项目档案（仅管理员，带分组标题隔开）
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

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    // D-23（2026-11-08）：从"12 项平铺"改成"6 个模块"。
    // 看板 / 任务 / 进度 / 风险 原本是四个平级入口，但读的是同一批 task+project，
    // 收进「项目管理」模块（进去后顶部 tab 切换），导航只留一个入口。
    // 不设分组标题：模块本身就是分组，再加标题会多一层噪音。
    title: '',
    items: [
      { key: '/', match: '/', exact: true, icon: <DashboardOutlined />, label: '工作台' },
      { key: '/projects', match: '/projects', icon: <ClusterOutlined />, label: '项目管理' },
      { key: '/team', match: '/team', icon: <TeamOutlined />, label: '团队协作' },
      { key: '/calendar', match: '/calendar', icon: <CalendarOutlined />, label: '日程安排' },
      { key: '/files', match: '/files', icon: <FolderOpenOutlined />, label: '文件资料' },
    ],
  },
];

/**
 * 管理员专属组（老六设计稿的 10 项之外）。
 *
 * 改名是为了消歧：
 * - 「项目管理」→「项目档案」：和「项目看板」只差两字，一个是列表维护、一个是看板视图；
 * - 「工作台」→「自定义工作台」：和「项目总览」都像首页，实际这里是模块拖拽编辑器。
 */
const ADMIN_GROUP: NavGroup = {
  title: '系统管理',
  items: [
    { key: '/workspace', match: '/workspace', icon: <AppstoreOutlined />, label: '自定义工作台' },
  ],
};

/** 贴底固定项：设置。落地页是个人资料（不是修改密码）。 */
const SETTINGS_ITEM: NavItem = {
  key: '/settings/profile',
  match: '/settings',
  icon: <SettingOutlined />,
  label: '设置',
};

/** 角色标签（shared/types.ts：角色只有 admin / user，另有 isSuper 标记超管）。 */
function roleLabel(role: string, isSuper: boolean): string {
  if (isSuper) return '超级管理员';
  return role === 'admin' ? '管理员' : '普通用户';
}

/** 把 NavItem 转成 AntD Menu 需要的结构（match / exact 不能透传）。 */
function toMenuItem(item: NavItem) {
  return { key: item.key, icon: item.icon, label: item.label };
}

/**
 * App Shell —— 左侧分组导航 + 顶部栏（pages.md §App Shell）。
 * 顶部栏只显示当前用户名、角色标签与退出，不显示搜索 / 通知 / AI。
 */
export function AppShell() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const groups = useMemo(
    () => (isAdmin ? [...NAV_GROUPS, ADMIN_GROUP] : NAV_GROUPS),
    [isAdmin],
  );

  const allItems = useMemo(
    () => [...groups.flatMap((g) => g.items), SETTINGS_ITEM],
    [groups],
  );

  // 按路径前缀高亮当前导航项；/settings/* 下的所有子页都高亮「设置」
  const selectedKey = useMemo(() => {
    const hit = allItems.find((item) =>
      item.exact
        ? location.pathname === item.key
        : location.pathname === item.match || location.pathname.startsWith(`${item.match}/`),
    );
    return hit?.key ?? '/';
  }, [allItems, location.pathname]);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      void navigate('/login', { replace: true });
    }
  };

  // 分组标题交给 AntD 的 group 渲染，样式在 global.css 的 .ant-menu-item-group-title 里
  // 无标题的分组直接平铺（D-23：六个模块不需要再套一层"导航"标题）
  // 用 for 循环建菜单项（flatMap 的联合类型 AntD 认不出来，会报 not assignable）
  const menuItems: MenuProps['items'] = [];
  for (const group of groups) {
    if (group.title) {
      menuItems.push({ type: 'group', label: group.title, children: group.items.map(toMenuItem) });
    } else {
      menuItems.push(...group.items.map(toMenuItem));
    }
  }

  return (
    <Layout className="wb-layout">
      <Sider width={designVars.siderWidth} className="wb-sider" theme="light">
        <div className="wb-brand">
          {/* 横版商标（标记 + BLACKHOLE + 标语），设计稿直接切出的透明底原图 */}
          <img className="wb-brand-lockup" src="/brand/blackhole-horizontal.png" alt="Black Hole" />
        </div>

        <Menu
          theme="light"
          mode="inline"
          className="wb-sider-menu"
          selectedKeys={[selectedKey]}
          items={menuItems}
          onClick={({ key }) => void navigate(key)}
        />

        {/* 贴底：设置不随菜单滚动跑掉 */}
        <div className="wb-sider-foot">
          <Menu
            theme="light"
            mode="inline"
            className="wb-sider-menu"
            selectedKeys={[selectedKey]}
            items={[toMenuItem(SETTINGS_ITEM)]}
            onClick={({ key }) => void navigate(key)}
          />
        </div>
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
