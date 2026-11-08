import { useState } from 'react';
import { App as AntdApp, Button, Drawer, Input, Popconfirm, Upload } from 'antd';
import { DownloadOutlined, HistoryOutlined, UploadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FileAsset } from '@blackhole/shared/types';
import {
  downloadFileVersion,
  fileKeys,
  listFileVersions,
  restoreFileVersion,
  uploadFileVersion,
} from '../../api/files';
import { errorText } from '../../api/messages';
import { formatBytes } from '../../utils/format';
import { formatDateTime } from '../../utils/datetime';
import { ToneTag } from '../ui';
import { StateBlock } from '../user/StateBlock';

/**
 * 文件版本历史抽屉（D-27）。
 *
 * 为什么做成抽屉而不是单独一页：版本是「某个文件的属性」，
 * 从文件行点进来更符合心智，关掉就回到列表，不用记路径。
 *
 * 口径：
 * - 回滚 = 以旧版本内容**生成一个新版本**（版本号继续 +1），不是把号退回去；
 * - 每版独占一份磁盘实体，删文件时应用层会把所有版本的实体一起删；
 * - 下载历史版本时文件名自动带 -v{n} 后缀，避免和当前版本混在一起。
 */
export function FileVersionDrawer({
  file,
  onClose,
}: {
  file: FileAsset | null;
  onClose: () => void;
}): JSX.Element {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const open = file !== null;
  const fileId = file?.id ?? 0;

  const versionsQuery = useQuery({
    queryKey: ['files', 'versions', fileId],
    queryFn: () => listFileVersions(fileId),
    enabled: open && fileId > 0,
  });
  const versions = versionsQuery.data?.items ?? [];
  const currentNo = versionsQuery.data?.currentVersionNo ?? 0;

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['files', 'versions', fileId] });
    await queryClient.invalidateQueries({ queryKey: fileKeys.all });
  };

  const uploadMutation = useMutation({
    mutationFn: (input: { file: File; note?: string }) =>
      uploadFileVersion(fileId, input.file, input.note),
    onSuccess: async () => {
      setNote('');
      setPendingFile(null);
      await refresh();
      void message.success('新版本已上传');
    },
    onError: (err) => void message.error(errorText(err)),
  });

  const restoreMutation = useMutation({
    mutationFn: (versionNo: number) => restoreFileVersion(fileId, versionNo),
    onSuccess: async (next) => {
      await refresh();
      void message.success(`已回滚，当前版本 v${next.versionNo ?? ''}`);
    },
    onError: (err) => void message.error(errorText(err)),
  });

  const download = async (versionNo: number) => {
    try {
      const base = file?.name ?? 'file';
      const dot = base.lastIndexOf('.');
      const downloadName =
        dot > 0 ? `${base.slice(0, dot)}-v${versionNo}${base.slice(dot)}` : `${base}-v${versionNo}`;
      await downloadFileVersion(fileId, versionNo, downloadName);
    } catch (err) {
      void message.error(errorText(err));
    }
  };

  return (
    <Drawer
      title={
        <span className="wb-version-title">
          <HistoryOutlined /> 版本历史
          {file ? <span className="wb-version-file">{file.name}</span> : null}
        </span>
      }
      width={520}
      open={open}
      onClose={onClose}
      destroyOnClose
    >
      <div className="wb-version-upload">
        <Input
          placeholder="这次改了什么（选填，最多 256 字）"
          value={note}
          maxLength={256}
          onChange={(event) => setNote(event.target.value)}
          style={{ marginBottom: 10 }}
        />
        <Upload
          showUploadList={false}
          beforeUpload={(picked) => {
            setPendingFile(picked);
            return false; // 不自动上传，点按钮才提交，避免误操作
          }}
        >
          <Button icon={<UploadOutlined />}>
            {pendingFile ? pendingFile.name : '选择新版本文件'}
          </Button>
        </Upload>
        <Button
          type="primary"
          style={{ marginLeft: 8 }}
          disabled={!pendingFile}
          loading={uploadMutation.isPending}
          onClick={() => {
            if (pendingFile) uploadMutation.mutate({ file: pendingFile, note: note.trim() || undefined });
          }}
        >
          上传为新版本
        </Button>
      </div>

      <StateBlock
        loading={versionsQuery.isPending}
        error={versionsQuery.isError ? versionsQuery.error : undefined}
        onRetry={() => void versionsQuery.refetch()}
        isEmpty={versions.length === 0}
        emptyText="还没有版本记录"
        emptyHint="历史登记数据没有实体，上传一次新版本后就会有记录"
      >
        <ul className="wb-version-list">
          {versions.map((version) => {
            const isCurrent = version.versionNo === currentNo;
            return (
              <li key={version.versionNo} className="wb-version-item">
                <div className="wb-version-row">
                  <span className="wb-version-no">v{version.versionNo}</span>
                  {isCurrent ? <ToneTag tone="green">当前</ToneTag> : null}
                  <span className="wb-version-meta">
                    {formatBytes(version.sizeBytes)} · {version.uploadedByName ?? '—'} ·{' '}
                    {formatDateTime(version.createdAt)}
                  </span>
                </div>
                {version.note ? <div className="wb-version-note">{version.note}</div> : null}
                <div className="wb-version-actions">
                  <Button size="small" icon={<DownloadOutlined />} onClick={() => void download(version.versionNo)}>
                    下载
                  </Button>
                  {isCurrent ? null : (
                    <Popconfirm
                      title={`回滚到 v${version.versionNo}？`}
                      description="会以该版本内容生成一个新版本，历史记录都保留"
                      okText="回滚"
                      cancelText="算了"
                      onConfirm={() => restoreMutation.mutate(version.versionNo)}
                    >
                      <Button size="small" loading={restoreMutation.isPending}>
                        回滚到此版
                      </Button>
                    </Popconfirm>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </StateBlock>
    </Drawer>
  );
}
