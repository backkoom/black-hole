import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';

/**
 * 403 页面 —— 「没有权限」（pages.md §8.8：不显示堆栈）。
 * 同时用于「普通用户直接访问管理路由」的场景。
 */
export function ForbiddenPage() {
  const navigate = useNavigate();

  return (
    <div className="wb-error-page">
      <Result
        status="403"
        title="没有权限"
        subTitle="当前账号无权访问该页面。"
        extra={
          <Button type="primary" onClick={() => void navigate('/workspace')}>
            返回工作台
          </Button>
        }
      />
    </div>
  );
}
