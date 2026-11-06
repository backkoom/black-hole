import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as AntdApp, Button, Modal, Segmented, Skeleton, Tooltip } from 'antd';
import { EditOutlined, SaveOutlined } from '@ant-design/icons';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker } from 'react-router-dom';
import { canAddModule, moveItem, reindex } from '@blackhole/shared';
import { DEFAULT_MODULE_CONFIGS, MODULE_BY_KEY } from '@blackhole/shared/modules';
import type { LayoutItem, Workspace } from '@blackhole/shared/types';
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
import { useAuth } from '../../auth/AuthContext';
import { ErrorResult } from '../ErrorResult';
import { ConfigPanel } from './config/ConfigPanel';
import { GridCanvas } from './GridCanvas';
import { MetricsRow } from './MetricsRow';
import { PageHeader } from '../PageHeader';
import { ModuleLibraryDrawer } from './ModuleLibraryDrawer';
import { VersionConflictModal } from './VersionConflictModal';
import { WorkspaceMetaModal } from './WorkspaceMetaModal';
import {
  computeInsertPointAtPointer,
  nextUid,
  pointerFromDragEvent,
  type EditorItem,
} from './layoutEditor';
import { clearDraft, draftKey, readDraft, writeDraft } from '../../utils/workspaceDraft';

/**
 * 工作台 / 工作台模板编辑器 —— pages.md §2 与 §10 共用。
 *
 * Phase 5 补齐的交互（执行包 §7.6）：
 * - 从模块库**拖入**画布：插入位置用共享包的 `computeInsertIndex`（前半插前、后半插后）；
 *   拖到画布外不插入；插入前用 `canAddModule` 检查（重复 / 占位 / 超上限 → 提示原因，不静默丢弃）；
 * - 画布内**排序**：onDragEnd 用共享包的 `moveItem`（向下拖动不差一位）；
 * - **缩放**：宽度 `snapWidth`、高度 `clampHeight`，都不小于模块 minSize，divider 固定 12×2；
 * - **删除**：二次确认，content 模块提示「会丢失该模块的配置」；
 * - **草稿**：本地 localStorage（key 带用户 id），刷新可恢复，保存成功后清除；
 * - **离开提示**：有未保存改动时 beforeunload + 路由拦截都拦一下；
 * - **预览态**：隐藏全部编辑控件，保存按钮禁用。
 */

export type WorkspaceEditorMode = 'workspace' | 'template';

/** 编辑器本地工作副本 */
interface EditorState {
  /** 基线版本号（提交时带上，服务端做 CAS） */
  version: number;
  /** 当前布局（带前端 uid） */
  items: EditorItem[];
  name: string;
  subtitle: string | null;
}

/** 待重发的请求类型（409 后「覆盖保存」要按它重发一次） */
type PendingSubmit = { kind: 'layout' } | { kind: 'meta'; name: string; subtitle: string };

interface ConflictState {
  serverVersion: number;
  serverItems: LayoutItem[];
  pending: PendingSubmit;
}

/** 拖拽来源 */
interface ActiveDrag {
  type: 'library' | 'canvas';
  moduleKey?: string;
  uid?: string;
}

export function WorkspaceEditor({ mode }: { mode: WorkspaceEditorMode }) {
  const { message } = AntdApp.useApp();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isTemplate = mode === 'template';

  const queryKey = isTemplate ? workspaceKeys.template : workspaceKeys.mine;
  const query = useQuery({
    queryKey,
    queryFn: isTemplate ? fetchWorkspaceTemplate : fetchMyWorkspace,
  });

  const [saved, setSaved] = useState<Workspace | null>(null);
  const [state, setState] = useState<EditorState | null>(null);
  const [preview, setPreview] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [configTarget, setConfigTarget] = useState<EditorItem | null>(null);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null);
  const [insertHint, setInsertHint] = useState<{ uid: string; before: boolean } | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const dirtyRef = useRef(false);
  /**
   * 拖拽时的实时指针位置。
   *
   * dnd-kit 的 `onDragEnd` 事件里只有 `activatorEvent`（按下那一刻）+ `delta`（累计位移），
   * 而 `delta` 取自 React state —— 如果一串 pointermove 挤在一次渲染之前，
   * onDragEnd 拿到的 delta 会是旧的（甚至整个事件为 null）。
   * 所以这里同时用 window 的 pointermove 直接记真实坐标，事件里的数据只作兜底。
   */
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  const storageKey = useMemo(
    () => draftKey(user?.id, isTemplate ? 'template' : 'workspace'),
    [user?.id, isTemplate],
  );

  // 记录指针位置（拖拽中用来算插入点）
  useEffect(() => {
    const onMove = (event: PointerEvent): void => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  // 服务端数据 → saved
  useEffect(() => {
    if (query.data) setSaved(query.data);
  }, [query.data]);

  /** 用服务端数据重建本地工作副本；本地有未保存改动时不动它 */
  const hydrate = useCallback(
    (server: Workspace, prev: EditorState | null): EditorState => {
      const stored = readDraft(storageKey);
      const useStored = stored !== null && stored.version === server.version;
      const source = useStored ? stored.items : server.items;
      const items: EditorItem[] = source.map((item, index) => {
        const prevItem = prev?.items[index];
        const uid = prevItem && prevItem.moduleKey === item.moduleKey ? prevItem.uid : nextUid();
        return { ...item, uid };
      });
      return {
        version: server.version,
        items,
        name: server.name,
        subtitle: server.subtitle,
      };
    },
    [storageKey],
  );

  // 服务端数据变化 → 同步本地工作副本（本地干净时才覆盖）
  useEffect(() => {
    if (!saved) return;
    if (dirtyRef.current) return;
    setState((prev) => hydrate(saved, prev));
  }, [saved, hydrate]);

  // 有未保存改动时写草稿
  useEffect(() => {
    if (!state || !saved) return;
    if (!dirtyRef.current) return;
    writeDraft(storageKey, {
      version: state.version,
      items: state.items.map(({ moduleKey, w, h, config }) => ({ moduleKey, w, h, config })),
      name: state.name,
      subtitle: state.subtitle,
      savedAt: Date.now(),
    });
  }, [state, saved, storageKey]);

  /** 当前是否有未保存改动 */
  const dirty = useMemo(() => {
    if (!state || !saved) return false;
    const localItems = JSON.stringify(
      state.items.map(({ moduleKey, w, h, config }) => [moduleKey, w, h, config]),
    );
    const serverItems = JSON.stringify(
      saved.items.map((item) => [item.moduleKey, item.w, item.h, item.config]),
    );
    if (localItems !== serverItems) return true;
    if (!isTemplate) return false;
    return state.name !== saved.name || state.subtitle !== saved.subtitle;
  }, [state, saved, isTemplate]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // 离开页面提示：路由拦截 + beforeunload
  const blocker = useBlocker(() => dirty);
  const [leaveOpen, setLeaveOpen] = useState(false);

  useEffect(() => {
    if (blocker.state === 'blocked') setLeaveOpen(true);
  }, [blocker.state]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

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
      queryClient.setQueryData(queryKey, data);
      setSaved(data);
      setState((prev) =>
        prev
          ? {
              version: data.version,
              items: data.items.map((item, index) => ({
                ...item,
                uid: prev.items[index]?.moduleKey === item.moduleKey ? prev.items[index].uid : nextUid(),
              })),
              name: data.name,
              subtitle: data.subtitle,
            }
          : null,
      );
      dirtyRef.current = false;
      clearDraft(storageKey);
      void message.success('已保存');
    },
    onError: (err) => handleSubmitError(err, { kind: 'layout' }),
  });

  const metaMutation = useMutation({
    mutationFn: (input: { name: string; subtitle: string; version: number; items: LayoutItem[] }) =>
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
      setSaved(data);
      setState((prev) =>
        prev
          ? {
              version: data.version,
              items: data.items.map((item, index) => ({
                ...item,
                uid: prev.items[index]?.moduleKey === item.moduleKey ? prev.items[index].uid : nextUid(),
              })),
              name: data.name,
              subtitle: data.subtitle,
            }
          : null,
      );
      dirtyRef.current = false;
      setMetaOpen(false);
      clearDraft(storageKey);
      void message.success('已保存');
    },
    onError: (err, variables) => handleSubmitError(err, {
      kind: 'meta',
      name: variables.name,
      subtitle: variables.subtitle,
    }),
  });

  /** 保存布局 */
  const handleSaveLayout = useCallback((): void => {
    if (!state) return;
    layoutMutation.mutate({
      version: state.version,
      items: state.items.map(({ moduleKey, w, h, config }) => ({ moduleKey, w, h, config })),
    });
  }, [state, layoutMutation]);

  /** 409 → 「刷新（丢弃本地）」 */
  const handleRefresh = useCallback((): void => {
    if (!conflict) return;
    setConflict(null);
    setLeaveOpen(false);
    const serverItems = conflict.serverItems;
    setSaved((prev) =>
      prev
        ? { ...prev, version: conflict.serverVersion, items: serverItems }
        : prev,
    );
    setState((prev) =>
      prev
        ? {
            ...prev,
            version: conflict.serverVersion,
            items: serverItems.map((item) => ({ ...item, uid: nextUid() })),
          }
        : prev,
    );
    dirtyRef.current = false;
    clearDraft(storageKey);
    void queryClient.invalidateQueries({ queryKey });
  }, [conflict, queryClient, queryKey, storageKey]);

  /** 409 → 「覆盖保存」：以服务端版本号为基础重发本地布局 */
  const handleOverwrite = useCallback((): void => {
    if (!conflict || !state) return;
    setConflict(null);
    const items = state.items.map(({ moduleKey, w, h, config }) => ({ moduleKey, w, h, config }));
    if (conflict.pending.kind === 'layout') {
      layoutMutation.mutate({ version: conflict.serverVersion, items });
      return;
    }
    metaMutation.mutate({
      name: conflict.pending.name,
      subtitle: conflict.pending.subtitle,
      version: conflict.serverVersion,
      items,
    });
  }, [conflict, state, layoutMutation, metaMutation]);

  /** 新增模块：先过 canAddModule，再插到指定位置 */
  const insertModule = useCallback(
    (moduleKey: string, index: number): void => {
      if (!state) return;
      const check = canAddModule(state.items, moduleKey);
      if (!check.ok) {
        void message.warning(check.message);
        return;
      }
      const def = MODULE_BY_KEY[moduleKey];
      const rawConfig = DEFAULT_MODULE_CONFIGS[moduleKey];
      const config: Record<string, unknown> = rawConfig
        ? (JSON.parse(JSON.stringify(rawConfig)) as Record<string, unknown>)
        : {};
      const item: EditorItem = {
        uid: nextUid(),
        moduleKey,
        w: def?.defaultSize.w ?? 3,
        h: def?.defaultSize.h ?? 3,
        config,
      };
      setState((prev) => {
        if (!prev) return prev;
        const items = [...prev.items];
        items.splice(index, 0, item);
        return { ...prev, items };
      });
      dirtyRef.current = true;
      void message.success(`已添加「${def?.name ?? moduleKey}」`);
    },
    [state, message],
  );

  /** 模块库点击添加（加到末尾） */
  const handleAddModule = useCallback(
    (moduleKey: string): void => {
      insertModule(moduleKey, state?.items.length ?? 0);
    },
    [insertModule, state],
  );

  /** 删除模块 */
  const handleDelete = useCallback(
    (item: EditorItem): void => {
      setState((prev) => {
        if (!prev) return prev;
        return { ...prev, items: reindex(prev.items.filter((i) => i.uid !== item.uid)) };
      });
      dirtyRef.current = true;
    },
    [],
  );

  /** 缩放 */
  const handleResize = useCallback(
    (item: EditorItem, w: EditorItem['w'], h: number): void => {
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((i) => (i.uid === item.uid ? { ...i, w, h } : i)),
        };
      });
      dirtyRef.current = true;
    },
    [],
  );

  /** 保存模块 config */
  const handleConfigSave = useCallback(
    (moduleKey: string, config: Record<string, unknown>): void => {
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((i) =>
            i.moduleKey === moduleKey ? { ...i, config } : i,
          ),
        };
      });
      dirtyRef.current = true;
      setConfigTarget(null);
    },
    [],
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragStart = useCallback((event: DragStartEvent): void => {
    // 拖拽开始：重置指针记录，等下一次 pointermove 更新
    pointerRef.current = null;
    const data = event.active.data.current as { type?: string; moduleKey?: string } | undefined;
    if (data?.type === 'library') {
      setActiveDrag({ type: 'library', moduleKey: data.moduleKey });
    } else {
      setActiveDrag({ type: 'canvas', uid: String(event.active.id) });
    }
  }, []);

  /**
   * 拖拽过程中刷新插入提示。
   *
   * 用 `onDragMove`（每次指针移动都触发）而不是 `onDragOver`（只在悬停目标变化时触发），
   * 这样提示才跟手；`onDragOver` 只在拖过模块边界时触发，覆盖不全。
   */
  const handleDragMove = useCallback(
    (event: DragMoveEvent): void => {
      if (activeDrag?.type !== 'library' || !state) return;
      const pointer = pointerRef.current ?? pointerFromDragEvent(event);
      const point = computeInsertPointAtPointer(pointer, state.items, canvasRef.current);
      if (!point) {
        setInsertHint(null);
        return;
      }
      const target = state.items[point.targetIndex];
      setInsertHint(target ? { uid: target.uid, before: point.before } : null);
    },
    [activeDrag, state],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent): void => {
      const data = event.active.data.current as { type?: string; moduleKey?: string } | undefined;
      setActiveDrag(null);
      setInsertHint(null);

      if (data?.type === 'library' && data.moduleKey) {
        if (!state) return;
        const pointer = pointerRef.current ?? pointerFromDragEvent(event);
        const point = computeInsertPointAtPointer(pointer, state.items, canvasRef.current);
        // 拖到画布外不插入
        if (!point) return;
        insertModule(data.moduleKey, point.insertIndex);
        return;
      }

      // 画布内排序：直接用共享包的 moveItem（arrayMove 语义，向下拖动不差一位）
      const overId = event.over ? String(event.over.id) : null;
      const activeId = String(event.active.id);
      if (!overId || overId === activeId || !state) return;
      const oldIndex = state.items.findIndex((i) => i.uid === activeId);
      const newIndex = state.items.findIndex((i) => i.uid === overId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
      setState((prev) => {
        if (!prev) return prev;
        return { ...prev, items: moveItem(prev.items, oldIndex, newIndex) };
      });
      dirtyRef.current = true;
    },
    [state, insertModule],
  );

  const handleDragCancel = useCallback((): void => {
    setActiveDrag(null);
    setInsertHint(null);
  }, []);

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

  const title = isTemplate ? '工作台模板' : (state?.name ?? '我的工作台');
  const subtitle = state?.subtitle ?? '';
  const existingKeys = (state?.items ?? [])
    .filter((item) => item.moduleKey !== 'divider')
    .map((item) => item.moduleKey);

  const dragOverlayLabel = activeDrag
    ? activeDrag.type === 'library'
      ? MODULE_BY_KEY[activeDrag.moduleKey ?? '']?.name ?? ''
      : MODULE_BY_KEY[state?.items.find((i) => i.uid === activeDrag.uid)?.moduleKey ?? '']?.name ?? ''
    : '';

  return (
    <div className="wb-page">
      <PageHeader
        title={title}
        subtitle={subtitle || '拖拽模块、调整尺寸，保存后就是你的专属首页。'}
        titleExtra={
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            aria-label="编辑名称与副标题"
            disabled={preview}
            onClick={() => setMetaOpen(true)}
          />
        }
        extra={
          <>
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
                  disabled={preview || !state}
                  onClick={handleSaveLayout}
                >
                  保存
                </Button>
              </span>
            </Tooltip>
          </>
        }
      />

      {/* 说清「工作台模板」和「自定义工作台」的关系 —— 两者共用同一个编辑器，
          但一个是"给新账号的默认值"、一个是"我自己的"。不写这一句，
          管理员改完模板会以为改动了所有人。 */}
      <div className="wb-workspace-hint">
        {isTemplate
          ? '这里是「工作台模板」：新账号首次进入时拿到的默认布局。改模板不会影响已有用户——他们仍然用自己保存过的布局。'
          : '这是你自己的「自定义工作台」。首次进入时的布局来自管理员设置的「工作台模板」，之后你在这里的改动只影响自己。'}
      </div>

      <MetricsRow />

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className={preview ? 'wb-editor is-preview' : 'wb-editor'}>
          <GridCanvas
            items={state?.items ?? []}
            preview={preview}
            canvasRef={canvasRef}
            dropHint={insertHint}
            onDelete={handleDelete}
            onResize={handleResize}
            onConfigure={setConfigTarget}
          />
          {preview ? null : (
            <ModuleLibraryDrawer onAdd={handleAddModule} existingKeys={existingKeys} />
          )}
        </div>
        <DragOverlay>
          {dragOverlayLabel ? <div className="wb-drag-overlay">{dragOverlayLabel}</div> : null}
        </DragOverlay>
      </DndContext>

      <ConfigPanel
        open={configTarget !== null}
        moduleKey={configTarget?.moduleKey ?? null}
        config={configTarget?.config ?? {}}
        onClose={() => setConfigTarget(null)}
        onSave={handleConfigSave}
      />

      <VersionConflictModal
        open={conflict !== null}
        serverVersion={conflict?.serverVersion ?? 0}
        localVersion={state?.version ?? 0}
        saving={layoutMutation.isPending || metaMutation.isPending}
        onRefresh={handleRefresh}
        onOverwrite={handleOverwrite}
        onCancel={() => setConflict(null)}
      />

      <WorkspaceMetaModal
        open={metaOpen}
        name={state?.name ?? ''}
        subtitle={state?.subtitle ?? null}
        title={isTemplate ? '模板名称与说明' : '工作台名称与说明'}
        nameLabel={isTemplate ? '模板名称' : '工作台名称'}
        subtitleLabel={isTemplate ? '模板说明' : '副标题'}
        saving={metaMutation.isPending}
        onCancel={() => setMetaOpen(false)}
        onSubmit={(values) => {
          if (!state) return;
          metaMutation.mutate({
            name: values.name,
            subtitle: values.subtitle,
            version: state.version,
            items: state.items.map(({ moduleKey, w, h, config }) => ({ moduleKey, w, h, config })),
          });
        }}
      />

      <Modal
        open={leaveOpen}
        title="有未保存的改动"
        okText="离开"
        cancelText="继续编辑"
        onCancel={() => {
          setLeaveOpen(false);
          if (blocker.state === 'blocked') blocker.reset();
        }}
        onOk={() => {
          setLeaveOpen(false);
          if (blocker.state === 'blocked') blocker.proceed();
        }}
      >
        当前工作台有未保存的改动，离开后这些改动会丢失。
      </Modal>
    </div>
  );
}
