import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  App as AntdApp,
  Avatar,
  Button,
  Dropdown,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Table,
  Upload,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  DeleteOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FileOutlined,
  FilePdfOutlined,
  FilePptOutlined,
  FileTextOutlined,
  FileZipOutlined,
  FolderFilled,
  MoreOutlined,
  PlusOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FileAsset, FileKind } from '@blackhole/shared/types';
import {
  createFolder,
  deleteFile,
  deleteFolder,
  downloadFile,
  fetchFileStats,
  fileKeys,
  listFiles,
  listFolders,
  uploadFile,
} from '../api/files';
import { errorText } from '../api/messages';
import { formatDateTime, todayShanghaiDate, toCalendarDate } from '../utils/datetime';
import { formatBytes } from '../utils/format';
import { designVars } from '../styles/theme';
import { MetricCard, Panel, ToneTag } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { StateBlock } from '../components/user/StateBlock';
import '../styles/files.css';

/**
 * 文件资料页（老六最终用户端界面 · 稿子图7）。
 *
 * 组件树：
 * FilesPage
 * ├─ PageHeader（「文件资料」+ 副标题）
 * ├─ .wb-metric-row（4 张指标卡）
 * └─ .wb-file-grid（12 列栅格）
 *    ├─ .wb-file-8：Panel「文件夹」（网格 + 新建文件夹）
 *    ├─ .wb-file-4：Panel「文件分类」（按 summary.byKind）
 *    ├─ .wb-file-8：Panel「文件列表」（搜索 + 分类下拉 + 表格）
 *    ├─ .wb-file-4：Panel「最近上传」（最近 5 个）
 *    ├─ .wb-file-4：Panel「版本历史」（按 version 分组）
 *    └─ .wb-file-4：Panel「文件权限」（说明文字）
 *
 * 数据口径（全部来自真实接口，没有 mock）：
 * - 文件清单：GET /api/files（folderId / kind / projectId 三个筛选都走服务端）；
 * - 汇总：GET /api/files/summary（totalCount / totalBytes / folderCount / byKind）；
 * - 文件夹：GET /api/folders；
 * - ⚠️ **本期只登记元数据，不存二进制** —— 没有上传 / 下载接口，
 *   所以「文件总数」「已用存储」都来自服务端的元数据统计；
 * - 「共享成员数」= 文件清单里 ownerName 去重后的数量（真实上传人）；
 * - 「今日上传」= 文件清单里 createdAt 落在今天（Asia/Shanghai）的条数。
 */

/** 文件类型 → 展示名 / 图标 / 颜色 */
const FILE_KIND_META: Record<FileKind, { label: string; icon: ReactNode; color: string }> = {
  doc: { label: '文档', icon: <FileTextOutlined />, color: designVars.primary },
  sheet: { label: '表格', icon: <FileExcelOutlined />, color: designVars.green },
  slide: { label: '演示', icon: <FilePptOutlined />, color: designVars.orange },
  image: { label: '图片', icon: <FileImageOutlined />, color: designVars.purple },
  pdf: { label: 'PDF', icon: <FilePdfOutlined />, color: designVars.red },
  archive: { label: '压缩包', icon: <FileZipOutlined />, color: designVars.muted },
  other: { label: '其他', icon: <FileOutlined />, color: designVars.muted },
};

/** 文件夹配色（展示层配色，接口不给颜色） */
const FOLDER_COLORS = [
  designVars.primary,
  designVars.green,
  designVars.orange,
  designVars.purple,
];


/** 容量指标卡专用 —— 统一按 MB / GB 展示（不足 1MB 也按 MB） */
function formatCapacity(bytes: number | null | undefined): string {
  const value = bytes ?? 0;
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value === 0) return '0 MB';
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** 版本号排序 —— v1.2 > v1.10 > v1.1（按数字段比，不是字符串比） */
function compareVersion(a: string, b: string): number {
  const parse = (text: string): number[] =>
    text
      .replace(/^[vV]/, '')
      .split('.')
      .map((part) => Number.parseInt(part, 10))
      .map((part) => (Number.isFinite(part) ? part : 0));
  const left = parse(a);
  const right = parse(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function FilesPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();

  const [keyword, setKeyword] = useState('');
  const [kindFilter, setKindFilter] = useState<FileKind | undefined>(undefined);
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);
  const [folderOpen, setFolderOpen] = useState(false);
  const [form] = Form.useForm<{ name?: string }>();

  /** 文件清单：分类下拉走服务端筛选；搜索框在已取到的清单上本地过滤 */
  const filesQuery = useQuery({
    queryKey: fileKeys.list({ kind: kindFilter }),
    queryFn: () => listFiles(kindFilter ? { kind: kindFilter } : {}),
    staleTime: 30_000,
  });

  /** 汇总统计 */
  const statsQuery = useQuery({
    queryKey: fileKeys.summary,
    queryFn: fetchFileStats,
    staleTime: 30_000,
  });

  /** 文件夹列表 */
  const foldersQuery = useQuery({
    queryKey: fileKeys.folders(),
    queryFn: () => listFolders(),
    staleTime: 30_000,
  });

  const files = filesQuery.data ?? [];
  const stats = statsQuery.data;
  const folders = foldersQuery.data ?? [];

  /** 搜索过滤（名称或上传人） */
  const visibleFiles = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    if (!text) return files;
    return files.filter((file) => {
      const haystack = `${file.name} ${file.ownerName ?? ''} ${file.folderName ?? ''}`.toLowerCase();
      return haystack.includes(text);
    });
  }, [files, keyword]);

  /** 共享成员数：上传人去重（真实数据） */
  const sharedMembers = useMemo(() => {
    const names = new Set<string>();
    files.forEach((file) => {
      if (file.ownerName) names.add(file.ownerName);
    });
    return names.size;
  }, [files]);

  /** 今日上传：createdAt 落在今天（Asia/Shanghai）的条数 */
  const todayUploads = useMemo(() => {
    const today = todayShanghaiDate();
    return files.filter((file) => toCalendarDate(file.createdAt) === today).length;
  }, [files]);

  /** 最近上传：按创建时间倒序取前 5 */
  const recentFiles = useMemo(() => {
    return [...files]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 5);
  }, [files]);

  /** 版本历史：按 version 分组（版本倒序），组内按文件名排 */
  const versionGroups = useMemo(() => {
    const groups = new Map<string, FileAsset[]>();
    files.forEach((file) => {
      const key = file.version;
      const list = groups.get(key) ?? [];
      list.push(file);
      groups.set(key, list);
    });
    return [...groups.entries()]
      .sort((a, b) => compareVersion(b[0], a[0]))
      .map(([version, items]) => ({
        version,
        items: [...items].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
        current: items.some((item) => item.currentVersion),
      }));
  }, [files]);

  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: fileKeys.all });
  };

  const folderMutation = useMutation({
    mutationFn: (name: string) => createFolder({ name }),
    onSuccess: async () => {
      await invalidate();
      void message.success('文件夹已创建');
      setFolderOpen(false);
      form.resetFields();
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  /** 上传：成功后刷新清单与统计，失败把服务端文案（413/422）原样给用户 */
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadFile(file),
    onSuccess: async (file) => {
      await invalidate();
      void message.success(`已上传 ${file.name}（${formatBytes(file.sizeBytes)}）`);
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: (id: number) => deleteFile(id),
    onSuccess: async () => {
      await invalidate();
      void message.success('文件已删除');
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (id: number) => deleteFolder(id),
    onSuccess: async () => {
      await invalidate();
      void message.success('文件夹已删除');
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  /** 批量删除勾选的文件（逐条调 DELETE /api/files/:id） */
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const results = await Promise.allSettled(ids.map((id) => deleteFile(id)));
      const failed = results.filter((result) => result.status === 'rejected');
      return { total: ids.length, failed: failed.length };
    },
    onSuccess: async (result) => {
      await invalidate();
      setSelectedKeys([]);
      if (result.failed > 0) {
        void message.error(`已删除 ${result.total - result.failed} 个文件，${result.failed} 个删除失败`);
      } else {
        void message.success(`已删除 ${result.total} 个文件`);
      }
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  const columns = useMemo<TableColumnsType<FileAsset>>(
    () => [
      {
        title: '文件名',
        dataIndex: 'name',
        ellipsis: true,
        render: (value: string, row: FileAsset) => {
          const meta = FILE_KIND_META[row.kind];
          return (
            <span className="wb-owner-cell">
              <span className="wb-file-icon" style={{ color: meta.color }}>
                {meta.icon}
              </span>
              <span className="wb-owner-name" title={value}>
                {value}
              </span>
            </span>
          );
        },
      },
      {
        title: '类型',
        dataIndex: 'kind',
        width: 78,
        render: (value: FileKind) => <ToneTag tone="blue">{FILE_KIND_META[value].label}</ToneTag>,
      },
      {
        title: '大小',
        dataIndex: 'sizeBytes',
        width: 88,
        render: (value: number) => (
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatBytes(value)}</span>
        ),
      },
      {
        title: '上传人',
        dataIndex: 'ownerName',
        width: 120,
        render: (value: string | null) =>
          value ? (
            <span className="wb-owner-cell">
              <Avatar size={24} style={{ background: '#dbe4f5', color: '#2563eb', fontSize: 11 }}>
                {value.slice(0, 1)}
              </Avatar>
              <span className="wb-owner-name">{value}</span>
            </span>
          ) : (
            <span className="wb-muted">—</span>
          ),
      },
      {
        title: '修改时间',
        dataIndex: 'updatedAt',
        width: 112,
        render: (value: string) => <span>{formatDateTime(value)}</span>,
      },
      {
        title: '操作',
        key: 'actions',
        width: 46,
        render: (_value: unknown, row: FileAsset) => (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                {
                  key: 'download',
                  icon: <DownloadOutlined />,
                  label: '下载',
                  // 历史登记数据没有实体，按钮灰着并说明原因
                  disabled: !row.hasFile,
                },
                { type: 'divider' as const },
                {
                  key: 'delete',
                  icon: <DeleteOutlined />,
                  label: '删除',
                  danger: true,
                },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'delete') deleteFileMutation.mutate(row.id);
                if (key === 'download') {
                  void downloadFile(row.id, row.name).catch((err) => {
                    void message.error(errorText(err));
                  });
                }
              },
            }}
          >
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined />}
              aria-label={`${row.name} 的更多操作`}
            />
          </Dropdown>
        ),
      },
    ],
    [deleteFileMutation, message],
  );

  const metricCards = [
    {
      label: '文件总数',
      value: stats?.totalCount ?? 0,
      icon: <FileOutlined />,
      color: designVars.primary,
      hint: stats ? `共 ${stats.folderCount} 个文件夹` : '按文件元数据统计',
    },
    {
      label: '已用存储',
      value: formatCapacity(stats?.totalBytes),
      icon: <FileZipOutlined />,
      color: designVars.green,
      hint: '按登记的文件大小累计',
    },
    {
      label: '共享成员数',
      value: sharedMembers,
      icon: <FileTextOutlined />,
      color: designVars.orange,
      hint: '上传人去重',
    },
    {
      label: '今日上传',
      value: todayUploads,
      icon: <PlusOutlined />,
      color: designVars.purple,
      hint: '按创建日期统计（东八区）',
    },
  ];

  return (
    <div className="wb-page">
      <PageHeader
        title="文件资料"
        subtitle="集中管理项目文件资料，支持团队共享与版本控制"
        extra={
          <Upload
            multiple
            showUploadList={false}
            beforeUpload={(file) => {
              uploadMutation.mutate(file);
              // 交给 mutation 自己管状态，别让 antd 再维护一份上传列表
              return Upload.LIST_IGNORE;
            }}
          >
            <Button
              type="primary"
              icon={<UploadOutlined />}
              loading={uploadMutation.isPending}
            >
              上传文件
            </Button>
          </Upload>
        }
      />

      {/* 4 张指标卡 */}
      <div className="wb-metric-row">
        {metricCards.map((card) => (
          <MetricCard
            key={card.label}
            label={card.label}
            value={card.value}
            icon={card.icon}
            iconColor={card.color}
            hint={card.hint}
          />
        ))}
      </div>

      <div className="wb-file-grid">
        {/* 文件夹 */}
        <div className="wb-file-8">
          <Panel
            title="文件夹"
            extra={
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => setFolderOpen(true)}
              >
                新建文件夹
              </Button>
            }
            flush
          >
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={foldersQuery.isPending}
                error={foldersQuery.isError ? foldersQuery.error : undefined}
                onRetry={() => void foldersQuery.refetch()}
                isEmpty={folders.length === 0}
                emptyText="还没有文件夹"
                emptyAction={
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => setFolderOpen(true)}
                  >
                    新建文件夹
                  </Button>
                }
              >
                <div className="wb-file-folders">
                  {folders.map((folder, index) => (
                    <div className="wb-file-folder" key={folder.id}>
                      <span
                        className="wb-file-folder-icon"
                        style={{ color: FOLDER_COLORS[index % FOLDER_COLORS.length] }}
                      >
                        <FolderFilled />
                      </span>
                      <span className="wb-file-folder-body">
                        <span className="wb-file-folder-name" title={folder.name}>
                          {folder.name}
                        </span>
                        <span className="wb-file-folder-count">{folder.fileCount} 个文件</span>
                      </span>
                      <Dropdown
                        trigger={['click']}
                        menu={{
                          items: [
                            {
                              key: 'delete',
                              icon: <DeleteOutlined />,
                              label: '删除',
                              danger: true,
                            },
                          ],
                          onClick: ({ key, domEvent }) => {
                            domEvent.stopPropagation();
                            if (key === 'delete') deleteFolderMutation.mutate(folder.id);
                          },
                        }}
                      >
                        <Button
                          type="text"
                          size="small"
                          icon={<MoreOutlined />}
                          aria-label={`${folder.name} 的更多操作`}
                        />
                      </Dropdown>
                    </div>
                  ))}
                </div>
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 文件分类 */}
        <div className="wb-file-4">
          <Panel title="文件分类" flush>
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={statsQuery.isPending}
                error={statsQuery.isError ? statsQuery.error : undefined}
                onRetry={() => void statsQuery.refetch()}
                isEmpty={(stats?.byKind.length ?? 0) === 0}
                emptyText="还没有文件"
              >
                {(stats?.byKind ?? []).map((item) => {
                  const meta = FILE_KIND_META[item.kind];
                  return (
                    <button
                      type="button"
                      className={`wb-file-category${kindFilter === item.kind ? ' is-active' : ''}`}
                      key={item.kind}
                      onClick={() =>
                        setKindFilter((prev) => (prev === item.kind ? undefined : item.kind))
                      }
                    >
                      <span className="wb-file-category-icon" style={{ color: meta.color }}>
                        {meta.icon}
                      </span>
                      <span className="wb-file-category-name">{meta.label}</span>
                      <span className="wb-file-category-count">{item.count}</span>
                      <span className="wb-file-category-arrow">›</span>
                    </button>
                  );
                })}
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 文件列表 */}
        <div className="wb-file-8">
          <Panel title="文件列表" flush>
            <div className="wb-file-toolbar">
              <Input
                className="wb-file-search"
                allowClear
                prefix={<SearchOutlined style={{ color: designVars.muted }} />}
                placeholder="搜索文件名、上传人或所在文件夹…"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
              <Select
                className="wb-file-kind-select"
                allowClear
                placeholder="全部分类"
                value={kindFilter}
                onChange={(value: FileKind | undefined) => setKindFilter(value)}
                options={(Object.keys(FILE_KIND_META) as FileKind[]).map((kind) => ({
                  value: kind,
                  label: FILE_KIND_META[kind].label,
                }))}
              />
              {selectedKeys.length > 0 ? (
                <Popconfirm
                  title={`删除选中的 ${selectedKeys.length} 个文件？`}
                  description="删除后不再计入统计与容量"
                  okText="删除"
                  cancelText="取消"
                  onConfirm={() =>
                    bulkDeleteMutation.mutate(
                      selectedKeys.filter((key): key is number => typeof key === 'number'),
                    )
                  }
                >
                  <Button size="small" danger icon={<DeleteOutlined />} loading={bulkDeleteMutation.isPending}>
                    删除所选
                  </Button>
                </Popconfirm>
              ) : null}
            </div>
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={filesQuery.isPending}
                error={filesQuery.isError ? filesQuery.error : undefined}
                onRetry={() => void filesQuery.refetch()}
                isEmpty={visibleFiles.length === 0}
                emptyText="没有符合条件的文件"
              >
                <Table<FileAsset>
                  className="wb-table"
                  size="small"
                  rowKey="id"
                  columns={columns}
                  dataSource={visibleFiles}
                  rowSelection={{
                    selectedRowKeys: selectedKeys,
                    onChange: setSelectedKeys,
                  }}
                  pagination={false}
                  scroll={{ x: 620 }}
                />
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 最近上传 */}
        <div className="wb-file-4">
          <Panel title="最近上传" flush>
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={filesQuery.isPending}
                error={filesQuery.isError ? filesQuery.error : undefined}
                onRetry={() => void filesQuery.refetch()}
                isEmpty={recentFiles.length === 0}
                emptyText="还没有上传记录"
              >
                {recentFiles.map((file) => {
                  const meta = FILE_KIND_META[file.kind];
                  return (
                    <div className="wb-file-recent" key={file.id}>
                      <span className="wb-file-recent-icon" style={{ color: meta.color }}>
                        {meta.icon}
                      </span>
                      <span className="wb-file-recent-body">
                        <span className="wb-file-recent-name" title={file.name}>
                          {file.name}
                        </span>
                        <span className="wb-file-recent-meta">
                          {file.ownerName ?? '未知上传人'} · {formatDateTime(file.createdAt)}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 版本历史 */}
        <div className="wb-file-4">
          <Panel title="版本历史" flush>
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={filesQuery.isPending}
                error={filesQuery.isError ? filesQuery.error : undefined}
                onRetry={() => void filesQuery.refetch()}
                isEmpty={versionGroups.length === 0}
                emptyText="还没有版本记录"
              >
                {versionGroups.map((group) => (
                  <div className="wb-file-version" key={group.version}>
                    <div className="wb-file-version-head">
                      <span className="wb-file-version-tag">{group.version}</span>
                      {group.current ? (
                        <ToneTag tone="green">当前版本</ToneTag>
                      ) : null}
                      <span className="wb-file-version-count">{group.items.length} 个文件</span>
                    </div>
                    {group.items.map((file) => (
                      <div className="wb-file-version-item" key={file.id}>
                        <span className="wb-file-version-name" title={file.name}>
                          {file.name}
                        </span>
                        <span className="wb-file-version-meta">
                          {file.ownerName ?? '—'} · {formatDateTime(file.updatedAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 文件权限 */}
        <div className="wb-file-4">
          <Panel title="文件权限" flush>
            <div style={{ padding: '0 18px 16px' }}>
              <div className="wb-file-permission">
                <p className="wb-file-permission-lead">
                  本期文件资料为<strong>只读展示</strong>，仅登记文件元数据（名称、类型、大小、版本与上传人）。
                </p>
                <ul className="wb-file-permission-list">
                  <li>文件在项目范围内对有权限的成员可见，列表按服务端返回的范围呈现。</li>
                  <li>文件夹与文件的归属、上传人、修改时间均来自服务端记录。</li>
                  <li>暂不提供上传、下载、在线预览与逐文件的权限配置。</li>
                </ul>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      {/* 新建文件夹 */}
      <Modal
        open={folderOpen}
        title="新建文件夹"
        onCancel={() => {
          setFolderOpen(false);
          form.resetFields();
        }}
        onOk={() => {
          form.validateFields()
            .then((values) => {
              const name = (values.name ?? '').trim();
              if (!name) return;
              folderMutation.mutate(name);
            })
            .catch(() => {
              // 字段级校验错误由 Form 自己展示
            });
        }}
        confirmLoading={folderMutation.isPending}
        okText="保存"
        cancelText="取消"
        maskClosable={false}
      >
        <Form<{ name?: string }> form={form} layout="vertical" requiredMark>
          <Form.Item
            name="name"
            label="文件夹名"
            rules={[
              { required: true, message: '请输入文件夹名' },
              { max: 128, message: '文件夹名不能超过 128 个字符' },
              { whitespace: true, message: '文件夹名不能全为空格' },
            ]}
          >
            <Input autoComplete="off" placeholder="请输入文件夹名" maxLength={128} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

// 兼容旧引用（formatBytes 已移到 utils/format.ts）
export { formatBytes } from '../utils/format';
