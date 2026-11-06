import { useEffect, useState } from 'react';
import { Alert, App, Button, Form, Input, Space, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../components/PageHeader';
import { Panel } from '../components/ui';
import { StateBlock } from '../components/user/StateBlock';
import { useAuth } from '../auth/AuthContext';
import { apiPut } from '../api/client';
import { designVars } from '../styles/theme';

/**
 * 个人资料（设置 → 个人资料）。
 *
 * 可改的只有**姓名** —— 后端 `PUT /api/users/:id` 对本人只放行 name 字段
 * （EDIT_FIELDS_SELF，动了别的字段会 403）。其余是只读展示。
 */

const ROLE_LABEL: Record<string, string> = {
  admin: '管理员',
  user: '普通用户',
};

export function ProfilePage() {
  const { user, refresh } = useAuth();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');

  useEffect(() => {
    if (user) setName(user.name);
  }, [user?.id, user?.name]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('未登录');
      await apiPut(`/users/${user.id}`, { name: name.trim() });
    },
    onSuccess: async () => {
      message.success('个人资料已保存');
      // 刷新会话态（名字变了，顶栏要跟着变）+ 让其他页面拿到新名字
      await refresh();
      void queryClient.invalidateQueries();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '保存失败';
      message.error(msg);
    },
  });

  if (!user) {
    return (
      <div className="wb-page">
        <PageHeader title="个人资料" subtitle="查看与维护你的账号信息" />
        <Panel title="个人资料">
          <StateBlock loading />
        </Panel>
      </div>
    );
  }

  const dirty = name.trim() !== user.name;
  const orgText = [user.org?.company, user.org?.dept].filter(Boolean).join(' / ');

  return (
    <div className="wb-page">
      <PageHeader title="个人资料" subtitle="查看与维护你的账号信息" />

      {user.mustChangePassword ? (
        <Alert
          type="warning"
          showIcon
          message="当前账号需要先修改初始密码"
          description={
            <Space direction="vertical" size={4}>
              <span>为保障账号安全，请先完成改密，改密后才能正常使用其他功能。</span>
              <Link to="/settings/password">前往修改密码 →</Link>
            </Space>
          }
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Panel
        title="基本资料"
        extra={
          <Space>
            <Button onClick={() => setName(user.name)} disabled={!dirty}>
              重置
            </Button>
            <Button
              type="primary"
              loading={saveMutation.isPending}
              disabled={!dirty || name.trim().length === 0}
              onClick={() => saveMutation.mutate()}
            >
              保存
            </Button>
          </Space>
        }
      >
        <Form layout="vertical" style={{ maxWidth: 460 }}>
          <Form.Item
            label="姓名"
            extra="姓名会显示在成员列表、任务负责人和审批记录里。"
            style={{ marginBottom: 8 }}
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              placeholder="请输入姓名"
              showCount
              aria-label="姓名"
            />
          </Form.Item>
        </Form>

        {/* 只读信息：之前「基本信息」和「账号与权限」把账号/角色各写了一遍，
            这块合并成一张「只看不改」的列表，一屏看完 */}
        <div className="wb-setting-list">
          <div className="wb-setting-row">
            <span className="wb-setting-label">账号</span>
            <span className="wb-setting-value">{user.account}</span>
          </div>
          <div className="wb-setting-row">
            <span className="wb-setting-label">角色</span>
            <span className="wb-setting-value">
              <Tag color={user.role === 'admin' ? 'blue' : 'default'}>
                {ROLE_LABEL[user.role] ?? user.role}
              </Tag>
              {user.isSuper ? <Tag color="purple">超级管理员</Tag> : null}
            </span>
          </div>
          <div className="wb-setting-row">
            <span className="wb-setting-label">所属组织</span>
            <span className="wb-setting-value">{orgText || '—'}</span>
          </div>
          <div className="wb-setting-row">
            <span className="wb-setting-label">初始密码</span>
            <span className="wb-setting-value">
              {user.mustChangePassword ? <Tag color="orange">待修改</Tag> : <Tag color="green">已修改</Tag>}
            </span>
          </div>
        </div>
      </Panel>

      <div style={{ height: 16 }} />

      <Panel title="安全">
        <div className="wb-setting-list">
          <div className="wb-setting-row">
            <span className="wb-setting-label">登录密码</span>
            <span className="wb-setting-value">建议定期更换；修改后其他设备上的会话会失效。</span>
            <Link to="/settings/password">
              <Button style={{ borderColor: designVars.primary, color: designVars.primary }}>
                修改密码
              </Button>
            </Link>
          </div>
        </div>
      </Panel>
    </div>
  );
}

export default ProfilePage;
