import { useEffect, useRef, useState } from 'react';
import { Alert, App as AntdApp, Button, Card, Form, Input } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { readRedirectTarget } from '../auth/redirect';
import { ApiError } from '../api/client';
import { LOGIN_INVALID_CREDENTIALS, REQUEST_FAILED } from '../api/messages';

interface LoginValues {
  account: string;
  password: string;
}

/** 账号规则：4 至 32 位，字母开头，仅含字母、数字和下划线（执行包 §6.5）。 */
const ACCOUNT_RULE = /^[A-Za-z][A-Za-z0-9_]{3,31}$/;

/**
 * 登录页 —— 居中卡片 360px（pages.md §1）。
 *
 * - 账号不存在与密码错误统一提示「账号或密码错误」，不泄露账号是否存在；
 * - 403 的服务端文案原样展示（账号已锁定 / 请先修改初始密码）；
 * - 登录成功后跳回原路由；must_change_password 时强制跳 /settings/password；
 * - 已登录访问 /login → 跳 /workspace。
 */
export function LoginPage() {
  const { message } = AntdApp.useApp();
  const { user, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form] = Form.useForm<LoginValues>();
  const [error, setError] = useState<{ status: number; text: string } | null>(null);

  // 未登录被拦截时记下的原路由，登录后跳回
  const from = readRedirectTarget(location.state);

  // 本次挂载期间是否发起过登录：用于区分「已登录访问 /login」与「刚登录成功」
  const attemptedRef = useRef(false);

  const loginMutation = useMutation({
    mutationFn: (values: LoginValues) => {
      attemptedRef.current = true;
      return login(values.account.trim().toLowerCase(), values.password);
    },
    onSuccess: (loggedInUser) => {
      void message.success('登录成功');
      if (loggedInUser.mustChangePassword) {
        // 强制改密：把原路由带过去，改密成功后跳回
        void navigate('/settings/password', { replace: true, state: { from } });
        return;
      }
      void navigate(from ?? '/', { replace: true });
    },
    onError: (err) => {
      attemptedRef.current = false;
      const apiError = err instanceof ApiError ? err : null;
      const status = apiError?.status ?? 0;
      // 401 统一提示「账号或密码错误」；其余状态码直接展示服务端文案
      const text = status === 401 ? LOGIN_INVALID_CREDENTIALS : (apiError?.message ?? REQUEST_FAILED);
      setError({ status, text });
    },
  });

  // 已登录访问 /login → 跳项目总览（登录成功的跳转由上面的 onSuccess 负责）
  useEffect(() => {
    if (isLoading || !user || attemptedRef.current) return;
    void navigate('/', { replace: true });
  }, [isLoading, user, navigate]);

  return (
    <div className="wb-login">
      <Card className="wb-login-card">
        <div className="wb-brand wb-login-brand">
          <span className="wb-brand-mark" aria-hidden="true">
            B
          </span>
          <span className="wb-brand-name">Black Hole</span>
        </div>

        {error ? (
          <Alert
            className="wb-login-alert"
            type={error.status === 403 ? 'warning' : 'error'}
            showIcon
            message={error.text}
          />
        ) : null}

        <Form<LoginValues>
          form={form}
          layout="vertical"
          requiredMark
          onFinish={(values) => {
            setError(null);
            loginMutation.mutate(values);
          }}
        >
          <Form.Item
            name="account"
            label="账号"
            rules={[
              { required: true, message: '请输入账号' },
              { pattern: ACCOUNT_RULE, message: '账号为 4-32 位，字母开头，仅含字母、数字和下划线' },
            ]}
          >
            <Input autoComplete="username" autoFocus placeholder="请输入账号" />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password autoComplete="current-password" placeholder="请输入密码" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loginMutation.isPending}>
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
