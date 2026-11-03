import { Alert, Button, Modal, Space, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

/**
 * 一次性初始密码弹窗 —— 新增账号 / 重置密码成功后展示。
 *
 * 服务端只返回一次明文（不落库），关闭后不可再查，所以必须明确提示「只显示这一次」。
 */
interface OneTimePasswordModalProps {
  open: boolean;
  /** 账号 */
  account: string;
  /** 一次性初始密码 */
  password: string;
  onClose: () => void;
}

export function OneTimePasswordModal({ open, account, password, onClose }: OneTimePasswordModalProps) {
  return (
    <Modal
      open={open}
      title="初始密码"
      onCancel={onClose}
      maskClosable={false}
      footer={[
        <Button key="ok" type="primary" onClick={onClose}>
          我已保存
        </Button>,
      ]}
    >
      <Alert
        className="wb-form-alert"
        type="warning"
        showIcon
        message="初始密码只显示这一次，关闭后不可再查询，请立即交给本人并让对方首次登录后修改。"
      />

      <div className="wb-onetime-field">
        <span className="wb-onetime-label">账号</span>
        <Typography.Text strong copyable={{ icon: <CopyOutlined /> }}>
          {account}
        </Typography.Text>
      </div>

      <div className="wb-onetime-field">
        <span className="wb-onetime-label">初始密码</span>
        <Space>
          <Typography.Text strong copyable={{ icon: <CopyOutlined /> }}>
            {password}
          </Typography.Text>
        </Space>
      </div>
    </Modal>
  );
}
