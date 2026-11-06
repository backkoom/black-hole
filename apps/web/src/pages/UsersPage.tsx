import { useMemo, useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Badge,
  Button,
  Card,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Tooltip,
} from 'antd';
import type { TableColumnsType } from 'antd';
import { ImportOutlined, KeyOutlined, PlusOutlined, StopOutlined, UserOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Role, User, UserListItem, UserStatus } from '@workbench/shared/types';
import { listUsers, resetUserPassword, setUserStatus, usersKeys } from '../api/users';
import { orgKeys } from '../api/org';
import { errorStatus, errorText } from '../api/messages';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { useOrgTree } from '../hooks/useOrgTree';
import { flattenOrgTree } from '../utils/orgTree';
import { formatDateTime } from '../utils/datetime';
import { ErrorResult } from '../components/ErrorResult';
import { UserFormModal } from '../components/UserFormModal';
import { OneTimePasswordModal } from '../components/OneTimePasswordModal';
import { ImportUsersModal } from '../components/ImportUsersModal';

/**
 * 账号管理页 —— pages.md §8。
 *
 * 组件树：
 * UsersPage
 * ├─ PageHeader(标题 + 批量导入 / 新增账号)
 * ├─ FilterBar(关键词 / 部门 / 角色 / 状态 / 重置)
 * ├─ Table(账号 / 姓名 / 角色 / 状态 / 部门 / 最后登录 / 操作)
 * │   └─ RowActions(编辑 / 停用 Popconfirm / 重置密码)
 * ├─ UserFormModal(新增 / 编辑；role 控件仅超管可见)
 * ├─ OneTimePasswordModal(一次性初始密码 + 复制)
 * └─ ImportUsersModal(选部门 → 下载模板 / 上传 CSV → 结果)
 *
 * 权限（服务端也会拦，前端提前禁用）：
 * - 本人只能改姓名；
 * - 管理员不能停用 / 重置其他管理员；
 * - 不能停用自己；
 * - 不能停用最后一个超管。
 */

interface Filters {
  keyword?: string;
  orgId?: number;
  role?: Role;
  status?: UserStatus;
  page: number;
  pageSize: number;
}

const INITIAL_FILTERS: Filters = { page: 1, pageSize: 20 };

/** 行内操作的可执行性 —— 按 role / isSuper 判断 */
interface RowActions {
  canDisable: boolean;
  disableReason?: string;
  canEnable: boolean;
  canReset: boolean;
  resetReason?: string;
}

function rowActions(target: UserListItem, actor: User, activeSuperCount: number): RowActions {
  const isSelf = target.id === actor.id;
  let canDisable = true;
  let disableReason: string | undefined;
  if (isSelf) {
    canDisable = false;
    disableReason = '不能停用自己';
  } else if (target.role === 'admin' && !target.isSuper && !actor.isSuper) {
    canDisable = false;
    disableReason = '管理员不能停用其他管理员';
  } else if (target.isSuper && target.status === 'active' && activeSuperCount <= 1) {
    canDisable = false;
    disableReason = '不能停用最后一个超级管理员';
  }

  let canReset = true;
  let resetReason: string | undefined;
  if (target.isSuper) {
    canReset = false;
    resetReason = '超级管理员账号不能被重置密码，请由本人修改';
  } else if (target.role === 'admin' && !actor.isSuper) {
    canReset = false;
    resetReason = '管理员不能重置其他管理员的密码';
  }

  return { canDisable, disableReason, canEnable: true, canReset, resetReason };
}

export function UsersPage() {
  const { message } = AntdApp.useApp();
  const { user: actor } = useAuth();
  const queryClient = useQueryClient();
  const orgQuery = useOrgTree();

  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [keywordInput, setKeywordInput] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserListItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [created, setCreated] = useState<{ account: string; password: string } | null>(null);

  const listQuery = useQuery({
    queryKey: ['users', 'list', filters],
    queryFn: () => listUsers(filters),
  });

  /**
   * 在用的超管数量 —— 用于「不能停用最后一个超管」的 UI 预判。
   * 取不到时按「不限制」处理，让服务端裁决。
   */
  const activeAdminQuery = useQuery({
    queryKey: usersKeys.activeAdmins,
    queryFn: () => listUsers({ page: 1, pageSize: 100, role: 'admin', status: 'active' }),
  });
  const activeSuperCount = activeAdminQuery.data
    ? activeAdminQuery.data.items.filter((item) => item.isSuper).length
    : Number.POSITIVE_INFINITY;

  const orgOptions = useMemo(
    () =>
      flattenOrgTree(orgQuery.data ?? []).map((item) => ({
        value: item.node.id,
        label: item.pathLabel,
      })),
    [orgQuery.data],
  );

  const statusMutation = useMutation({
    mutationFn: (input: { id: number; status: UserStatus }) => setUserStatus(input.id, input.status),
    onSuccess: async (_updated, variables) => {
      await queryClient.invalidateQueries({ queryKey: usersKeys.list });
      await queryClient.invalidateQueries({ queryKey: orgKeys.tree });
      void message.success(variables.status === 'active' ? '已启用' : '已停用');
    },
    onError: (err) => {
      // 不能停用自己 / 不能停用最后一个超管 → 服务端 422，文案原样展示
      void message.error(errorText(err));
    },
  });

  const resetMutation = useMutation({
    mutationFn: (input: { id: number; account: string }) => resetUserPassword(input.id),
    onSuccess: (data, variables) => {
      void message.success('密码已重置');
      setCreated({ account: variables.account, password: data.initialPassword });
    },
    onError: (err) => {
      void message.error(errorText(err));
    },
  });

  const columns = useMemo<TableColumnsType<UserListItem>>(() => {
    if (!actor) return [];
    return [
      {
        title: '账号',
        dataIndex: 'account',
        width: 110,
        render: (value: string) => <span style={{ color: 'var(--text-2)' }}>{value}</span>,
      },
      {
        title: '姓名',
        dataIndex: 'name',
        width: 110,
        render: (value: string) => <span style={{ fontWeight: 600 }}>{value}</span>,
      },
      {
        title: '角色',
        dataIndex: 'role',
        width: 100,
        render: (_value: string, row: UserListItem) => (
          <span>
            {row.isSuper ? '超管' : row.role === 'admin' ? '管理员' : '普通用户'}
          </span>
        ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 90,
        render: (value: UserStatus) =>
          value === 'active' ? (
            <Badge status="success" text="在职" />
          ) : (
            <Badge status="default" text="已停用" />
          ),
      },
      {
        title: '部门',
        dataIndex: 'org',
        width: 160,
        render: (_value: UserListItem['org'], row: UserListItem) => (
          <span>
            {row.org.dept}
            {row.org.company ? (
              <span className="wb-muted"> （{row.org.company}）</span>
            ) : null}
          </span>
        ),
      },
      {
        title: '最后登录',
        dataIndex: 'lastLoginAt',
        width: 150,
        render: (value: string | null) => <span>{formatDateTime(value)}</span>,
      },
      {
        title: '操作',
        key: 'actions',
        fixed: 'right',
        width: 200,
        render: (_value: unknown, row: UserListItem) => {
          const actions = rowActions(row, actor, activeSuperCount);
          const isActive = row.status === 'active';
          return (
            <Space size={4}>
              <Button
                type="link"
                size="small"
                icon={<UserOutlined />}
                onClick={() => {
                  setEditing(row);
                  setFormOpen(true);
                }}
              >
                编辑
              </Button>

              {isActive ? (
                actions.canDisable ? (
                  <Popconfirm
                    title={`停用「${row.name}」？`}
                    description="停用后该账号已有会话立即失效"
                    okText="停用"
                    cancelText="取消"
                    onConfirm={() => statusMutation.mutate({ id: row.id, status: 'disabled' })}
                  >
                    <Button type="link" size="small" danger icon={<StopOutlined />}>
                      停用
                    </Button>
                  </Popconfirm>
                ) : (
                  <Tooltip title={actions.disableReason}>
                    <span>
                      <Button type="link" size="small" danger icon={<StopOutlined />} disabled>
                        停用
                      </Button>
                    </span>
                  </Tooltip>
                )
              ) : (
                <Button
                  type="link"
                  size="small"
                  icon={<StopOutlined />}
                  onClick={() => statusMutation.mutate({ id: row.id, status: 'active' })}
                >
                  启用
                </Button>
              )}

              <Tooltip title={actions.resetReason}>
                <span>
                  <Button
                    type="link"
                    size="small"
                    icon={<KeyOutlined />}
                    disabled={!actions.canReset}
                    onClick={() => resetMutation.mutate({ id: row.id, account: row.account })}
                  >
                    重置密码
                  </Button>
                </span>
              </Tooltip>
            </Space>
          );
        },
      },
    ];
  }, [actor, activeSuperCount, statusMutation.mutate, resetMutation.mutate]);

  const resetFilters = (): void => {
    setKeywordInput('');
    setFilters(INITIAL_FILTERS);
  };

  return (
    <div className="wb-page">
      <PageHeader
        title="账号管理"
        subtitle="账号、角色、状态与批量导入；初始密码只在创建或重置时显示一次。"
        extra={
          <>
            <Button icon={<ImportOutlined />} onClick={() => setImportOpen(true)}>
              批量导入
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              新增账号
            </Button>
          </>
        }
      />

      <Card className="wb-card-flat">
        <div className="wb-filter-bar">
          <Input.Search
            className="wb-filter-search"
            value={keywordInput}
            allowClear
            placeholder="搜索账号或姓名"
            onChange={(event) => setKeywordInput(event.target.value)}
            onSearch={(value) =>
              setFilters((prev) => ({ ...prev, keyword: value.trim() || undefined, page: 1 }))
            }
          />
          <Select
            className="wb-filter-item"
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder="全部部门"
            value={filters.orgId}
            onChange={(value) => setFilters((prev) => ({ ...prev, orgId: value, page: 1 }))}
            options={orgOptions}
          />
          <Select
            className="wb-filter-item"
            allowClear
            placeholder="全部角色"
            value={filters.role}
            onChange={(value) => setFilters((prev) => ({ ...prev, role: value, page: 1 }))}
            options={[
              { value: 'admin', label: '管理员' },
              { value: 'user', label: '普通用户' },
            ]}
          />
          <Select
            className="wb-filter-item"
            allowClear
            placeholder="全部状态"
            value={filters.status}
            onChange={(value) => setFilters((prev) => ({ ...prev, status: value, page: 1 }))}
            options={[
              { value: 'active', label: '在职' },
              { value: 'disabled', label: '已停用' },
            ]}
          />
          <div className="wb-filter-actions">
            <Button onClick={resetFilters}>重置</Button>
          </div>
        </div>

        {orgQuery.isError ? (
          <Alert
            className="wb-form-alert"
            type="error"
            showIcon
            message={errorText(orgQuery.error)}
            action={
              <Button size="small" onClick={() => void orgQuery.refetch()}>
                重试
              </Button>
            }
          />
        ) : null}

        {listQuery.isError ? (
          <ErrorResult
            status={errorStatus(listQuery.error)}
            text={errorText(listQuery.error)}
            onRetry={() => void listQuery.refetch()}
          />
        ) : (
          <Table<UserListItem>
            className="wb-table"
            size="small"
            rowKey="id"
            loading={listQuery.isPending}
            columns={columns}
            dataSource={listQuery.data?.items ?? []}
            scroll={{ x: 'max-content' }}
            pagination={{
              current: filters.page,
              pageSize: filters.pageSize,
              total: listQuery.data?.total ?? 0,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50', '100'],
              showTotal: (total) => `共 ${total} 个账号`,
              onChange: (page, pageSize) =>
                setFilters((prev) => ({ ...prev, page, pageSize })),
            }}
          />
        )}
      </Card>

      <UserFormModal
        open={formOpen}
        mode={editing ? 'edit' : 'create'}
        target={editing}
        orgOptions={orgOptions}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onCreated={(user: User, initialPassword: string) =>
          setCreated({ account: user.account, password: initialPassword })
        }
      />

      <OneTimePasswordModal
        open={created !== null}
        account={created?.account ?? ''}
        password={created?.password ?? ''}
        onClose={() => setCreated(null)}
      />

      <ImportUsersModal
        open={importOpen}
        orgOptions={orgOptions}
        onClose={() => setImportOpen(false)}
      />
    </div>
  );
}
