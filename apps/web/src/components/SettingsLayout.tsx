import { useMemo } from 'react';
import { Menu, Tag } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { designVars } from '../styles/theme';

interface SettingsNavItem {
  key: string;
  label: string;
  /** Phase 1 未实现的功能，置灰不可点 */
  disabled?: boolean;
}

/**
 * 设置页左侧子导航 —— pages.md §App Shell：个人资料、修改密码；
 * 管理员追加账号管理、组织架构、工作台模板。
 * Phase 2 起「账号管理」「组织架构」是真实页面；Phase 3 起「工作台模板」也是真实页面；
 * 「个人资料」自 2026-11-05 起也是真实页面（可改姓名，其余只读）。
 */
export function SettingsLayout() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const items = useMemo<SettingsNavItem[]>(() => {
    const list: SettingsNavItem[] = [
      // 个人资料已做成真实页面（2026-11-05）—— 不再是占位
      { key: '/settings/profile', label: '个人资料' },
      { key: '/settings/password', label: '修改密码' },
    ];
    // 普通用户不显示管理入口
    if (isAdmin) {
      list.push(
        { key: '/settings/users', label: '账号管理' },
        { key: '/settings/org', label: '组织架构' },
        { key: '/settings/workspace-template', label: '工作台模板' },
      );
    }
    return list;
  }, [isAdmin]);

  const selectedKey = useMemo(
    () => items.find((item) => location.pathname.startsWith(item.key))?.key,
    [items, location.pathname],
  );

  return (
    <div className="wb-settings">
      <nav className="wb-settings-nav" style={{ width: designVars.settingsNavWidth }}>
        <Menu
          mode="inline"
          selectedKeys={selectedKey ? [selectedKey] : []}
          items={items.map((item) => ({
            key: item.key,
            disabled: item.disabled,
            title: item.disabled ? '功能迭代中' : undefined,
            label: item.disabled ? (
              <span className="wb-settings-nav-label">
                {item.label}
                <Tag className="wb-settings-nav-tag">迭代</Tag>
              </span>
            ) : (
              item.label
            ),
          }))}
          onClick={({ key }) => void navigate(key)}
        />
      </nav>
      <div className="wb-settings-body">
        <Outlet />
      </div>
    </div>
  );
}
