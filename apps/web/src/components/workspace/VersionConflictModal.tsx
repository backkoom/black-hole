import { Button, Modal } from 'antd';

/**
 * 版本冲突弹窗 —— pages.md §2「VersionConflictModal(刷新丢弃本地 / 覆盖保存)」。
 *
 * 服务端返回 409 时（openapi VersionConflict）：
 * - 「刷新（丢弃本地）」：丢弃本地改动，改用服务端当前的 version 与 items；
 * - 「覆盖保存」：以服务端当前 version 为基础，再提交一次本地的 items。
 *
 * 覆盖只在用户显式点击后发生，不做自动重试。
 */

interface VersionConflictModalProps {
  open: boolean;
  /** 服务端当前版本号 */
  serverVersion: number;
  /** 本地当前版本号 */
  localVersion: number;
  /** 覆盖保存进行中 */
  saving: boolean;
  onRefresh: () => void;
  onOverwrite: () => void;
  onCancel: () => void;
}

export function VersionConflictModal({
  open,
  serverVersion,
  localVersion,
  saving,
  onRefresh,
  onOverwrite,
  onCancel,
}: VersionConflictModalProps) {
  return (
    <Modal
      open={open}
      title="版本冲突"
      onCancel={onCancel}
      maskClosable={false}
      footer={[
        <Button key="refresh" onClick={onRefresh} disabled={saving}>
          刷新（丢弃本地）
        </Button>,
        <Button key="overwrite" type="primary" onClick={onOverwrite} loading={saving}>
          覆盖保存
        </Button>,
      ]}
    >
      <p>布局已被他人修改，请选择刷新或覆盖。</p>
      <p className="wb-muted">
        本地版本 v{localVersion}，服务端版本 v{serverVersion}。
        「刷新」会丢弃本地改动并加载服务端布局；「覆盖保存」会以服务端版本号重新提交本地布局。
      </p>
    </Modal>
  );
}
