import { useEffect, useState } from 'react';
import { Alert, App, Button, Descriptions, Form, Input, Space, Tag, Typography } from 'antd';
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
        title="基本信息"
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
          <Form.Item label="姓名">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              placeholder="请输入姓名"
              showCount
              aria-label="姓名"
            />
          </Form.Item>
          <Form.Item label="账号">
            <Input value={user.account} disabled aria-label="账号" />
          </Form.Item>
          <Form.Item label="角色" style={{ marginBottom: 0 }}>
            <Space>
              <Tag color={user.role === 'admin' ? 'blue' : 'default'}>
                {ROLE_LABEL[user.role] ?? user.role}
              </Tag>
              {user.isSuper ? <Tag color="purple">超级管理员</Tag> : null}
            </Space>
          </Form.Item>
        </Form>
      </Panel>

      <div style={{ height: 16 }} />

      <Panel title="账号与权限">
        <Descriptions
          column={1}
          size="small"
          items={[
            { key: 'account', label: '账号', children: user.account },
            { key: 'name', label: '姓名', children: user.name },
            {
              key: 'role',
              label: '角色',
              children: ROLE_LABEL[user.role] ?? user.role,
            },
            {
              key: 'org',
              label: '所属组织',
              children: orgText || '—',
            },
            {
              key: 'mustChange',
              label: '初始密码',
              children: user.mustChangePassword ? (
                <Tag color="orange">待修改</Tag>
              ) : (
                <Tag color="green">已修改</Tag>
              ),
            },
          ]}
        />
      </Panel>

      <div style={{ height: 16 }} />

      <Panel title="安全">
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <Typography.Text type="secondary">
            登录密码请定期更换；修改密码后会强制刷新会话状态。
          </Typography.Text>
          <div>
            <Link to="/settings/password">
              <Button style={{ borderColor: designVars.primary, color: designVars.primary }}>
                修改密码 →
              </Button>
            </Link>
          </div>
        </Space>
      </Panel>
    </div>
  );
}

export default ProfilePage;
