import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';

/**
 * 404 页面 —— 「页面不存在 / 资源不存在」（pages.md §8.8：不显示堆栈）。
 */
export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="wb-error-page">
      <Result
        status="404"
        title="页面不存在"
        subTitle="资源不存在或已被移除。"
        extra={
          <Button type="primary" onClick={() => void navigate('/workspace')}>
            返回工作台
          </Button>
        }
      />
    </div>
  );
}
