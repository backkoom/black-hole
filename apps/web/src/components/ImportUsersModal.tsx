import { useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Button,
  Empty,
  Modal,
  Select,
  Space,
  Statistic,
  Table,
  Typography,
  Upload,
} from 'antd';
import type { UploadFile } from 'antd';
import type { ImportResult } from '@blackhole/shared/types';
import { CopyOutlined, DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { downloadImportTemplate, importUsers, usersKeys } from '../api/users';
import { orgKeys } from '../api/org';
import { errorText } from '../api/messages';
import { downloadBlob, toCsv } from '../utils/download';

/**
 * 批量导入账号弹窗 —— pages.md §8 的 ImportModal。
 *
 * 流程：先选部门 → 下载模板 / 上传 CSV → 结果表（success / skipped / failed + 错误行 + 初始密码）。
 * 初始密码一次性返回、服务端不保存明文，所以必须提示「只显示这一次」并支持当场下载回执。
 */

interface ImportUsersModalProps {
  open: boolean;
  /** 部门下拉选项（路径名） */
  orgOptions: { value: number; label: string }[];
  onClose: () => void;
}

export function ImportUsersModal({ open, orgOptions, onClose }: ImportUsersModalProps) {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [orgId, setOrgId] = useState<number | undefined>(undefined);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = (): void => {
    setOrgId(undefined);
    setFileList([]);
    setResult(null);
    setError(null);
  };

  const close = (): void => {
    reset();
    onClose();
  };

  const templateMutation = useMutation({
    mutationFn: downloadImportTemplate,
    onSuccess: (blob) => {
      downloadBlob(blob, 'users-template.csv');
      void message.success('模板已下载');
    },
    onError: (err) => {
      setError(errorText(err));
    },
  });

  const importMutation = useMutation({
    mutationFn: (input: { file: File; orgId: number }) => importUsers(input.file, input.orgId),
    onSuccess: async (data) => {
      setResult(data);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: usersKeys.list });
      await queryClient.invalidateQueries({ queryKey: orgKeys.tree });
      void message.success(`导入完成：成功 ${data.success} 个`);
    },
    onError: (err) => {
      setError(errorText(err));
    },
  });

  const startImport = (): void => {
    const file = fileList[0]?.originFileObj;
    if (!file) {
      setError('请先选择 CSV 文件');
      return;
    }
    if (orgId === undefined) {
      setError('请选择部门');
      return;
    }
    setError(null);
    importMutation.mutate({ file, orgId });
  };

  const downloadPasswords = (): void => {
    if (!result) return;
    const csv = toCsv(
      ['账号', '初始密码'],
      result.initialPasswords.map((item) => [item.account, item.password]),
    );
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'users-initial-passwords.csv');
  };

  return (
    <Modal
      open={open}
      title="批量导入账号"
      width={720}
      onCancel={close}
      maskClosable={false}
      footer={
        result ? (
          <Button type="primary" onClick={close}>
            完成
          </Button>
        ) : (
          <Space>
            <Button onClick={close}>取消</Button>
            <Button
              type="primary"
              loading={importMutation.isPending}
              disabled={orgId === undefined || fileList.length === 0}
              onClick={() => {
                setError(null);
                startImport();
              }}
            >
              开始导入
            </Button>
          </Space>
        )
      }
    >
      {result ? (
        <ImportResultView result={result} onDownloadPasswords={downloadPasswords} />
      ) : (
        <div className="wb-import-form">
          {error ? (
            <Alert className="wb-form-alert" type="error" showIcon message={error} />
          ) : null}

          <div className="wb-import-row">
            <span className="wb-import-label">部门</span>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="请选择部门（人员只能挂在末级节点上）"
              value={orgId}
              onChange={(value) => setOrgId(value)}
              options={orgOptions}
              style={{ minWidth: 320 }}
            />
          </div>

          <div className="wb-import-row">
            <span className="wb-import-label">模板</span>
            <Button
              icon={<DownloadOutlined />}
              loading={templateMutation.isPending}
              onClick={() => templateMutation.mutate()}
            >
              下载导入模板
            </Button>
            <span className="wb-import-hint">CSV 三列：姓名,账号,角色；首行表头，最多 1000 行</span>
          </div>

          <Upload.Dragger
            accept=".csv,text/csv"
            maxCount={1}
            fileList={fileList}
            beforeUpload={() => false}
            onChange={({ fileList: next }) => setFileList(next.slice(-1))}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽 CSV 文件到此处</p>
            <p className="ant-upload-hint">UTF-8 CSV，允许带 BOM；文件不超过 2MB</p>
          </Upload.Dragger>
        </div>
      )}
    </Modal>
  );
}

/** 导入结果：三个计数 + 错误行 + 一次性初始密码 */
function ImportResultView({
  result,
  onDownloadPasswords,
}: {
  result: ImportResult;
  onDownloadPasswords: () => void;
}) {
  return (
    <div className="wb-import-result">
      <Space size={26} className="wb-stat-row">
        <Statistic title="成功" value={result.success} valueStyle={{ fontSize: 19, fontWeight: 700 }} />
        <Statistic title="跳过" value={result.skipped} valueStyle={{ fontSize: 19, fontWeight: 700 }} />
        <Statistic
          title="失败"
          value={result.failed}
          valueStyle={{ fontSize: 19, fontWeight: 700, color: '#ef4444' }}
        />
      </Space>

      <Alert
        className="wb-form-alert"
        type="warning"
        showIcon
        message="初始密码只显示这一次，关闭后不可再查询，请立即下载回执并交给本人。"
      />

      {result.errors.length > 0 ? (
        <div className="wb-import-block">
          <div className="wb-import-block-title">错误行</div>
          <Table
            className="wb-table"
            size="small"
            rowKey={(row) => `${row.row}-${row.message}`}
            dataSource={result.errors}
            pagination={false}
            columns={[
              { title: '行号', dataIndex: 'row', width: 90 },
              { title: '原因', dataIndex: 'message' },
            ]}
          />
        </div>
      ) : null}

      <div className="wb-import-block">
        <div className="wb-import-block-title">
          <span>一次性初始密码</span>
          <Button
            type="link"
            size="small"
            icon={<DownloadOutlined />}
            disabled={result.initialPasswords.length === 0}
            onClick={onDownloadPasswords}
          >
            下载 CSV
          </Button>
        </div>
        {result.initialPasswords.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有需要展示的初始密码" />
        ) : (
          <Table
            className="wb-table"
            size="small"
            rowKey="account"
            dataSource={result.initialPasswords}
            pagination={false}
            columns={[
              { title: '账号', dataIndex: 'account', width: 200 },
              {
                title: '初始密码',
                dataIndex: 'password',
                render: (value: string) => (
                  <Typography.Text strong copyable={{ icon: <CopyOutlined /> }}>
                    {value}
                  </Typography.Text>
                ),
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}
