import { useState } from 'react';
import { Alert, App as AntdApp, Button, Form, Input } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { readRedirectTarget } from '../auth/redirect';
import { apiPut, ApiError } from '../api/client';
import { MUST_CHANGE_PASSWORD, REQUEST_FAILED } from '../api/messages';
import { PageHeader } from '../components/PageHeader';

interface ChangePasswordValues {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** 新密码策略：8 至 64 位，至少一个字母和一个数字（执行包 §6.5）。 */
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;

/**
 * 修改密码页 —— pages.md §7。
 *
 * 首次登录（must_change_password）由 RequireAuth 强制跳到这里；
 * 改密成功后回到原路由（没有原路由时回工作台）。
 */
export function ChangePasswordPage() {
  const { message } = AntdApp.useApp();
  const { refresh, applyPasswordChanged, mustChangePassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form] = Form.useForm<ChangePasswordValues>();
  const [error, setError] = useState<string | null>(null);

  // 未登录被拦截时记下的原路由：改密成功后跳回
  const from = readRedirectTarget(location.state);

  // 改密成功后的落点：原路由不是改密页自身时回原路由，否则回工作台
  const target = from && from !== '/settings/password' ? from : '/workspace';

  const changeMutation = useMutation({
    mutationFn: (values: ChangePasswordValues) =>
      apiPut<null>('/auth/password', {
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      }),
    onSuccess: async () => {
      void message.success('密码修改成功');
      // 先同步清掉 must_change_password，守卫才不会把刚改完密码的用户弹回本页；
      // 再拉一次 /auth/me 拿到服务端最终状态。
      applyPasswordChanged();
      await refresh();
      void navigate(target, { replace: true });
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : REQUEST_FAILED);
    },
  });

  const onFinish = (values: ChangePasswordValues) => {
    setError(null);
    changeMutation.mutate(values);
  };

  return (
    <div className="wb-page">
      <PageHeader
        title="修改密码"
        subtitle={
          mustChangePassword
            ? '当前账号需要先修改初始密码，修改完成后才能使用其他功能。'
            : '修改成功后，其他设备上的登录会话会失效。'
        }
        showMeta={false}
      />

      <div className="wb-card">
        <Form<ChangePasswordValues> form={form} layout="vertical" requiredMark onFinish={onFinish}>
          {error ? (
            <Alert className="wb-form-alert" type="error" showIcon message={error} />
          ) : null}

          {mustChangePassword ? (
            <Alert
              className="wb-form-alert"
              type="warning"
              showIcon
              message={MUST_CHANGE_PASSWORD}
            />
          ) : null}

          <Form.Item name="oldPassword" label="旧密码" rules={[{ required: true, message: '请输入旧密码' }]}>
            <Input.Password autoComplete="current-password" placeholder="请输入旧密码" />
          </Form.Item>

          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { pattern: PASSWORD_RULE, message: '新密码为 8-64 位，且至少包含一个字母和一个数字' },
            ]}
          >
            <Input.Password autoComplete="new-password" placeholder="请输入新密码" />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            label="确认新密码"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: '请再次输入新密码' },
              ({ getFieldValue }) => ({
                validator: (_rule, value: string | undefined) =>
                  !value || getFieldValue('newPassword') === value
                    ? Promise.resolve()
                    : Promise.reject(new Error('两次输入的新密码不一致')),
              }),
            ]}
          >
            <Input.Password autoComplete="new-password" placeholder="请再次输入新密码" />
          </Form.Item>

          <Alert
            className="wb-form-alert"
            type="info"
            showIcon
            message="密码规则：至少 8 位，含字母和数字"
          />

          <Form.Item className="wb-form-actions">
            <Button type="primary" htmlType="submit" loading={changeMutation.isPending}>
              提交
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
}
