import { useMemo } from 'react';
import { Menu } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { designVars } from '../styles/theme';

interface SettingsNavItem {
  key: string;
  label: string;
}

/**
 * 设置页左侧子导航 —— 分两段（2026-11-05 老六定的二期调整）。
 *
 * 之前 5 项平铺在一层：个人资料 / 修改密码 / 账号管理 / 组织架构 / 工作台模板。
 * 管理员看到的是"个人设置"和"系统管理"混在一起，普通用户则完全看不出后面三项存在。
 *
 * 现在：
 *   个人      个人资料、修改密码              ← 谁都能看
 *   系统管理  账号管理、组织架构、工作台模板    ← 仅管理员，整段不出现
 */
export function SettingsLayout() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const items = useMemo(() => {
    const personal = {
      type: 'group' as const,
      label: '个人',
      children: [
        { key: '/settings/profile', label: '个人资料' },
        { key: '/settings/password', label: '修改密码' },
      ],
    };
    if (!isAdmin) return [personal];
    return [
      personal,
      {
        type: 'group' as const,
        label: '系统管理',
        children: [
          { key: '/settings/users', label: '账号管理' },
          { key: '/settings/org', label: '组织架构' },
          { key: '/settings/workspace-template', label: '工作台模板' },
          // 2026-11-08 新增：备份 / 文件存储 / HTTPS 证书（D-22）
          { key: '/settings/system', label: '系统设置' },
        ],
      },
    ];
  }, [isAdmin]);

  // 所有可选项拍平，用于反查当前选中项
  const flat = useMemo<SettingsNavItem[]>(
    () => items.flatMap((group) => group.children),
    [items],
  );

  const selectedKey = useMemo(
    () => flat.find((item) => location.pathname.startsWith(item.key))?.key,
    [flat, location.pathname],
  );

  return (
    <div className="wb-settings">
      <nav className="wb-settings-nav" style={{ width: designVars.settingsNavWidth }}>
        <Menu
          mode="inline"
          selectedKeys={selectedKey ? [selectedKey] : []}
          items={items}
          onClick={({ key }) => void navigate(key)}
        />
      </nav>
      <div className="wb-settings-body">
        <Outlet />
      </div>
    </div>
  );
}
