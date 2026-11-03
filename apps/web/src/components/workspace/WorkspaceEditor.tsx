import { useCallback, useEffect, useState } from 'react';
import { App as AntdApp, Button, Segmented, Skeleton, Tooltip } from 'antd';
import { EditOutlined, SaveOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LayoutItem } from '@workbench/shared/types';
import {
  fetchMyWorkspace,
  fetchWorkspaceTemplate,
  readWorkspaceConflict,
  saveWorkspaceLayout,
  saveWorkspaceTemplate,
  updateWorkspaceMeta,
  workspaceKeys,
} from '../../api/workspace';
import { errorStatus, errorText } from '../../api/messages';
import { ErrorResult } from '../ErrorResult';
import { GridCanvas } from './GridCanvas';
import { MetricsRow } from './MetricsRow';
import { ModuleLibraryDrawer } from './ModuleLibraryDrawer';
import { VersionConflictModal } from './VersionConflictModal';
import { WorkspaceMetaModal } from './WorkspaceMetaModal';

/**
 * 工作台编辑器 —— pages.md §2（工作台）与 §10（工作台模板）共用的编辑器外壳。
 *
 * Phase 3 只做「编辑器外壳」（执行包 §9.5）：
 * - 画布用 CSS Grid 渲染当前 items（真实数据）；
 * - 模块库列出 15 个模块，3 个 placeholder 置灰 + 「迭代」角标 + 不可用；
 * - 保存走 PUT，带当前 version；冲突 409 弹「刷新 / 覆盖保存」；
 * - 预览态隐藏编辑控件，只读展示；
 * - 名称/副标题单独 PUT，不参与 version。
 *
 * 不做（Phase 5 才做）：拖拽排序、拖入新增、缩放手柄、删除模块。
 *
 * mode='template' 时数据源换成 /api/workspace/template，其余交互完全一致。
 */

export type WorkspaceEditorMode = 'workspace' | 'template';

interface WorkspaceEditorProps {
  mode: WorkspaceEditorMode;
}

/** 本地工作副本：version + items 由布局保存管理，name/subtitle 由单独的 PUT 管理 */
interface Draft {
  version: number;
  items: LayoutItem[];
  name: string;
  subtitle: string | null;
}

/** 待重发的请求类型（409 后「覆盖保存」要按它重发一次） */
type PendingSubmit =
  | { kind: 'layout' }
  | { kind: 'meta'; name: string; subtitle: string };

interface ConflictState {
  /** 服务端当前 version */
  serverVersion: number;
  /** 服务端当前 items */
  serverItems: LayoutItem[];
  /** 触发冲突的请求 */
  pending: PendingSubmit;
}

export function WorkspaceEditor({ mode }: WorkspaceEditorProps) {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const isTemplate = mode === 'template';

  const queryKey = isTemplate ? workspaceKeys.template : workspaceKeys.mine;
  const query = useQuery({
    queryKey,
    queryFn: isTemplate ? fetchWorkspaceTemplate : fetchMyWorkspace,
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  // 服务端数据变化时同步本地工作副本（保存成功、冲突刷新后都走这里）
  useEffect(() => {
    const data = query.data;
    if (!data) return;
    setDraft({
      version: data.version,
      items: data.items,
      name: data.name,
      subtitle: data.subtitle,
    });
  }, [query.data]);

  /** 提交失败：409 走冲突弹窗，其余按服务端原文提示 */
  const handleSubmitError = useCallback(
    (err: unknown, pending: PendingSubmit): void => {
      const payload = readWorkspaceConflict(err);
      if (payload) {
        setConflict({
          serverVersion: payload.version,
          serverItems: payload.items,
          pending,
        });
        return;
      }
      void message.error(errorText(err));
    },
    [message],
  );

  const layoutMutation = useMutation({
    mutationFn: (input: { version: number; items: LayoutItem[] }) =>
      isTemplate ? saveWorkspaceTemplate(input) : saveWorkspaceLayout(input),
    onSuccess: (data) => {
      // 用响应里的 version / items 覆盖本地状态
      queryClient.setQueryData(queryKey, data);
      void message.success('已保存');
    },
    onError: (err) => handleSubmitError(err, { kind: 'layout' }),
  });

  const metaMutation = useMutation({
    mutationFn: (input: {
      name: string;
      subtitle: string;
      version: number;
      items: LayoutItem[];
    }) =>
      isTemplate
        ? saveWorkspaceTemplate({
            name: input.name,
            subtitle: input.subtitle,
            version: input.version,
            items: input.items,
          })
        : updateWorkspaceMeta({ name: input.name, subtitle: input.subtitle }),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      setMetaOpen(false);
      void message.success('已保存');
    },
    onError: (err, variables) =>
      handleSubmitError(err, {
        kind: 'meta',
        name: variables.name,
        subtitle: variables.subtitle,
      }),
  });

  /** 保存布局：带当前 version */
  const handleSaveLayout = useCallback((): void => {
    if (!draft) return;
    layoutMutation.mutate({ version: draft.version, items: draft.items });
  }, [draft, layoutMutation]);

  /** 409 → 「刷新」：丢弃本地改动，用服务端 version + items 覆盖本地 */
  const handleRefresh = useCallback((): void => {
    if (!conflict) return;
    setDraft((prev) =>
      prev
        ? { ...prev, version: conflict.serverVersion, items: conflict.serverItems }
        : prev,
    );
    setConflict(null);
    // 名称/副标题以服务端为准，重新拉一次
    void queryClient.invalidateQueries({ queryKey });
  }, [conflict, queryClient, queryKey]);

  /** 409 → 「覆盖保存」：以服务端 version 为基础，再提交一次当前本地内容 */
  const handleOverwrite = useCallback((): void => {
    if (!conflict || !draft) return;
    setConflict(null);
    if (conflict.pending.kind === 'layout') {
      layoutMutation.mutate({ version: conflict.serverVersion, items: draft.items });
      return;
    }
    metaMutation.mutate({
      name: conflict.pending.name,
      subtitle: conflict.pending.subtitle,
      version: conflict.serverVersion,
      items: draft.items,
    });
  }, [conflict, draft, layoutMutation, metaMutation]);

  const handleMetaSubmit = useCallback(
    (values: { name: string; subtitle: string }): void => {
      if (!draft) return;
      metaMutation.mutate({
        name: values.name,
        subtitle: values.subtitle,
        version: draft.version,
        items: draft.items,
      });
    },
    [draft, metaMutation],
  );

  if (query.isPending) {
    return (
      <div className="wb-page">
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="wb-page">
        <ErrorResult
          status={errorStatus(query.error)}
          text={errorText(query.error)}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const title = isTemplate ? '工作台模板' : (draft?.name ?? '我的工作台');
  const subtitle = draft?.subtitle ?? '';

  return (
    <div className="wb-page">
      <div className="wb-page-head">
        <div>
          <div className="wb-page-title-row">
            <h1 className="wb-page-title">{title}</h1>
            <Button
              type="text"
              size="small"
              icon={<EditOutlined />}
              aria-label="编辑名称与副标题"
              disabled={preview}
              onClick={() => setMetaOpen(true)}
            />
          </div>
          {subtitle ? <p className="wb-page-sub">{subtitle}</p> : null}
        </div>
        <div className="wb-page-head-actions">
          <Segmented
            value={preview ? 'preview' : 'edit'}
            onChange={(value) => setPreview(value === 'preview')}
            options={[
              { label: '编辑', value: 'edit' },
              { label: '预览', value: 'preview' },
            ]}
          />
          <Tooltip title={preview ? '预览模式下不可保存' : undefined}>
            <span>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                loading={layoutMutation.isPending}
                disabled={preview || !draft}
                onClick={handleSaveLayout}
              >
                保存
              </Button>
            </span>
          </Tooltip>
        </div>
      </div>

      <MetricsRow />

      <div className={preview ? 'wb-editor is-preview' : 'wb-editor'}>
        <GridCanvas items={draft?.items ?? []} preview={preview} />
        {preview ? null : <ModuleLibraryDrawer />}
      </div>

      <VersionConflictModal
        open={conflict !== null}
        serverVersion={conflict?.serverVersion ?? 0}
        localVersion={draft?.version ?? 0}
        saving={layoutMutation.isPending || metaMutation.isPending}
        onRefresh={handleRefresh}
        onOverwrite={handleOverwrite}
        onCancel={() => setConflict(null)}
      />

      <WorkspaceMetaModal
        open={metaOpen}
        name={draft?.name ?? ''}
        subtitle={draft?.subtitle ?? null}
        title={isTemplate ? '模板名称与说明' : '工作台名称与说明'}
        nameLabel={isTemplate ? '模板名称' : '工作台名称'}
        subtitleLabel={isTemplate ? '模板说明' : '副标题'}
        saving={metaMutation.isPending}
        onCancel={() => setMetaOpen(false)}
        onSubmit={handleMetaSubmit}
      />
    </div>
  );
}
