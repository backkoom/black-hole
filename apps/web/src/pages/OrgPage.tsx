import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App as AntdApp,
  Badge,
  Breadcrumb,
  Button,
  Card,
  Empty,
  Popconfirm,
  Result,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tree,
} from 'antd';
import type { TableColumnsType, TreeDataNode } from 'antd';
import {
  ApartmentOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SwapOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrgNode, User, UserListItem } from '@blackhole/shared/types';
import { PageHeader } from '../components/PageHeader';
import { deleteOrg, orgKeys } from '../api/org';
import { listUsers } from '../api/users';
import { errorStatus, errorText } from '../api/messages';
import { useOrgTree } from '../hooks/useOrgTree';
import { flattenOrgTree, findOrgNode, orgPathOf, subtreeIds } from '../utils/orgTree';
import { formatDateTime } from '../utils/datetime';
import { ErrorResult } from '../components/ErrorResult';
import { OrgFormModal } from '../components/OrgFormModal';
import { MoveOrgModal } from '../components/MoveOrgModal';
import { UserFormModal } from '../components/UserFormModal';
import { OneTimePasswordModal } from '../components/OneTimePasswordModal';
import { StateBlock } from '../components/user/StateBlock';

/**
 * 组织架构页 —— pages.md §9。
 *
 * 组件树：
 * OrgPage
 * ├─ PageHeader(标题 + 新增下级 / 新增人员)
 * ├─ Tree(左：层级树，标题带人数徽标，节点操作：新增下级 / 重命名 / 移动 / 删除)
 * ├─ DetailPanel(右：面包屑 / 统计行 / 人员表格)
 * ├─ OrgFormModal(新增节点 / 改名)
 * ├─ MoveOrgModal(选择新上级)
 * └─ UserFormModal + OneTimePasswordModal(在该节点下新增人员)
 *
 * 规则：
 * - 人员必须挂在末级节点（服务端 422「人员必须挂在末级节点上」）；
 * - 有人员的节点不能再加子节点（服务端 422「该节点下仍有人员…」）；
 * - 层级上限由服务端 MAX_ORG_LEVEL 控制（不设固定上限），超限时服务端 422，错误文案原样展示。
 */

const PAGE_SIZE = 20;

export function OrgPage() {
  const { message } = AntdApp.useApp();
  const queryClient = useQueryClient();
  const treeQuery = useOrgTree();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<number[]>([]);
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<OrgNode | null>(null);
  const [moveTarget, setMoveTarget] = useState<OrgNode | null>(null);
  const [userOpen, setUserOpen] = useState(false);
  const [created, setCreated] = useState<{ account: string; password: string } | null>(null);

  const nodes = treeQuery.data;

  const flat = useMemo(() => flattenOrgTree(nodes ?? []), [nodes]);

  // 首次拿到树时默认选中根节点，并展开全部层级
  useEffect(() => {
    if (!nodes) return;
    setExpandedKeys(flat.map((item) => item.node.id));
    setSelectedId((prev) => {
      if (prev !== null && findOrgNode(nodes ?? [], prev)) return prev;
      return nodes[0]?.id ?? null;
    });
  }, [nodes, flat]);

  const selected = selectedId === null ? null : findOrgNode(nodes ?? [], selectedId);
  const breadcrumb = selectedId === null ? [] : orgPathOf(nodes ?? [], selectedId);

  // 人员列表：只列直接挂在该节点的用户
  const usersQuery = useQuery({
    queryKey: ['org', 'users', selectedId, page],
    queryFn: () => listUsers({ page, pageSize: PAGE_SIZE, orgId: selectedId ?? 0 }),
    enabled: selectedId !== null,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteOrg(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orgKeys.tree });
      await queryClient.invalidateQueries({ queryKey: ['org', 'users'] });
      void message.success('已删除');
    },
    onError: (err) => {
      // 有子节点 / 仍有人员时服务端 422，文案原样展示
      void message.error(errorText(err));
    },
  });

  const userColumns: TableColumnsType<UserListItem> = [
    {
      title: '姓名',
      dataIndex: 'name',
      width: 110,
      render: (value: string) => <span style={{ fontWeight: 600 }}>{value}</span>,
    },
    {
      title: '登录账号',
      dataIndex: 'account',
      width: 130,
      render: (value: string) => <span style={{ color: 'var(--text-2)' }}>{value}</span>,
    },
    {
      title: '角色',
      dataIndex: 'role',
      width: 100,
      render: (_value: string, row: UserListItem) => (
        <span>{row.isSuper ? '超管' : row.role === 'admin' ? '管理员' : '普通用户'}</span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (value: string) =>
        value === 'active' ? (
          <Badge status="success" text="在职" />
        ) : (
          <Badge status="default" text="已停用" />
        ),
    },
    {
      title: '最后登录',
      dataIndex: 'lastLoginAt',
      width: 150,
      render: (value: string | null) => <span>{formatDateTime(value)}</span>,
    },
  ];

  const treeData = useMemo<TreeDataNode[]>(() => {
    const build = (list: OrgNode[]): TreeDataNode[] =>
      list.map((node) => ({
        key: node.id,
        icon: <ApartmentOutlined />,
        title: (
          <span className="wb-tree-title">
            <span className="wb-tree-name">{node.name}</span>
            <Badge
              className="wb-tree-count"
              count={node.userCount}
              showZero
              style={{
                background: '#f2f4f8',
                color: '#98a1b3',
                boxShadow: 'none',
                borderRadius: 8,
                fontSize: 10.5,
              }}
            />
            <span className="wb-tree-actions">
              <Button
                type="text"
                size="small"
                aria-label={`在 ${node.name} 下新增下级`}
                icon={<PlusOutlined />}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedId(node.id);
                  setCreateOpen(true);
                }}
              />
              <Button
                type="text"
                size="small"
                aria-label={`重命名 ${node.name}`}
                icon={<EditOutlined />}
                onClick={(event) => {
                  event.stopPropagation();
                  setRenameTarget(node);
                }}
              />
              <Button
                type="text"
                size="small"
                aria-label={`移动 ${node.name}`}
                title={node.parentId === null ? '根节点不可移动' : undefined}
                icon={<SwapOutlined />}
                disabled={node.parentId === null}
                onClick={(event) => {
                  event.stopPropagation();
                  setMoveTarget(node);
                }}
              />
              <Popconfirm
                title={`删除「${node.name}」？`}
                description="有子节点或仍有人员时服务端会拒绝删除"
                okText="删除"
                cancelText="取消"
                onConfirm={() => deleteMutation.mutate(node.id)}
              >
                <Button
                  type="text"
                  size="small"
                  danger
                  aria-label={`删除 ${node.name}`}
                  title={node.parentId === null ? '根节点不可删除' : undefined}
                  icon={<DeleteOutlined />}
                  disabled={node.parentId === null}
                  onClick={(event) => event.stopPropagation()}
                />
              </Popconfirm>
            </span>
          </span>
        ),
        children: build(node.children),
      }));
    return build(nodes ?? []);
  }, [nodes, deleteMutation]);

  const moveOptions = useMemo(() => {
    if (!moveTarget) return [];
    const excluded = subtreeIds(moveTarget);
    return flat
      .filter((item) => !excluded.has(item.node.id))
      .map((item) => ({ value: item.node.id, label: item.pathLabel }));
  }, [flat, moveTarget]);

  return (
    <div className="wb-page">
      <PageHeader
        title="组织架构"
        subtitle="左侧选择节点，右侧查看该节点下的人员；人员只能挂在末级节点上。"
        extra={
          <>
            {flat.length === 0 ? (
              // 树为空时唯一的入口：先建根节点（2026-11-06 后端已支持 parentId=null）
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                新增根节点
              </Button>
            ) : (
              <>
                <Button
                  icon={<PlusOutlined />}
                  disabled={!selected}
                  onClick={() => setCreateOpen(true)}
                >
                  新增下级
                </Button>
                <Button
                  type="primary"
                  icon={<UserAddOutlined />}
                  disabled={!selected}
                  onClick={() => setUserOpen(true)}
                >
                  新增人员
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="wb-org-grid">
        <Card
          className="wb-card-flat"
          title="组织结构"
          extra={<span className="wb-muted">{flat.length} 个节点</span>}
        >
          {treeQuery.isPending ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : treeQuery.isError ? (
            <ErrorResult
              status={errorStatus(treeQuery.error)}
              text={errorText(treeQuery.error)}
              onRetry={() => void treeQuery.refetch()}
            />
          ) : nodes && nodes.length > 0 ? (
            <Tree
              className="wb-tree"
              blockNode
              showLine={{ showLeafIcon: false }}
              treeData={treeData}
              selectedKeys={selectedId === null ? [] : [selectedId]}
              expandedKeys={expandedKeys}
              onExpand={(keys) => setExpandedKeys(keys.map((key) => Number(key)))}
              onSelect={(keys) => {
                const key = keys[0];
                if (typeof key === 'number') {
                  setSelectedId(key);
                  setPage(1);
                }
              }}
            />
          ) : (
            <StateBlock
              isEmpty
              emptyText="还没有组织节点"
              emptyHint="从根节点开始建：点右上角「新增根节点」，再逐级往下加部门与班组。"
              emptyAction={
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
                  新增根节点
                </Button>
              }
            />
          )}
        </Card>

        <section className="wb-org-detail">
          {selected ? (
            <>
              <Breadcrumb
                className="wb-crumb"
                separator="/"
                items={breadcrumb.map((node, index) => ({
                  title:
                    index === breadcrumb.length - 1 ? (
                      <b style={{ color: 'var(--text)' }}>{node.name}</b>
                    ) : (
                      node.name
                    ),
                }))}
              />

              <Space size={26} className="wb-stat-row">
                <Statistic
                  title={<span style={{ fontSize: 11.5, color: 'var(--muted)' }}>人员</span>}
                  value={selected.userCount}
                  valueStyle={{ fontSize: 19, fontWeight: 700 }}
                />
                <Statistic
                  title={<span style={{ fontSize: 11.5, color: 'var(--muted)' }}>下级</span>}
                  value={selected.children.length}
                  valueStyle={{ fontSize: 19, fontWeight: 700 }}
                />
                <Statistic
                  title={<span style={{ fontSize: 11.5, color: 'var(--muted)' }}>层级</span>}
                  value={selected.level}
                  valueStyle={{ fontSize: 19, fontWeight: 700 }}
                />
              </Space>

              <Card
                className="wb-card-flat"
                title="人员列表"
                extra={<span className="wb-muted">{selected.name}</span>}
              >
                {usersQuery.isError ? (
                  <ErrorResult
                    status={errorStatus(usersQuery.error)}
                    text={errorText(usersQuery.error)}
                    onRetry={() => void usersQuery.refetch()}
                  />
                ) : (
                  <Table<UserListItem>
                    className="wb-table"
                    size="small"
                    rowKey="id"
                    loading={usersQuery.isPending}
                    columns={userColumns}
                    dataSource={usersQuery.data?.items ?? []}
                    scroll={{ x: 'max-content' }}
                    locale={{
                      emptyText: (
                        <Empty
                          image={Empty.PRESENTED_IMAGE_SIMPLE}
                          styles={{ image: { height: 48 } }}
                          description="该节点下还没有人员"
                        />
                      ),
                    }}
                    pagination={{
                      current: page,
                      pageSize: PAGE_SIZE,
                      total: usersQuery.data?.total ?? 0,
                      showSizeChanger: false,
                      onChange: (next) => setPage(next),
                    }}
                  />
                )}

                <Alert
                  className="wb-hint"
                  type="info"
                  showIcon={false}
                  message={
                    <span>
                      这是<b>管理员视角</b>。普通用户登录后看不到这个页面，只能在个人资料里看到自己所属的公司与部门。
                    </span>
                  }
                />
              </Card>
            </>
          ) : (
            <Result status="info" title="请选择节点" subTitle="在左侧选择一个组织节点查看详情。" />
          )}
        </section>
      </div>

      <OrgFormModal
        open={createOpen}
        mode="create"
        parent={selected}
        onClose={() => setCreateOpen(false)}
      />

      <OrgFormModal
        open={renameTarget !== null}
        mode="rename"
        node={renameTarget}
        onClose={() => setRenameTarget(null)}
      />

      <MoveOrgModal
        open={moveTarget !== null}
        node={moveTarget}
        options={moveOptions}
        onClose={() => setMoveTarget(null)}
      />

      <UserFormModal
        open={userOpen}
        mode="create"
        orgOptions={flat.map((item) => ({ value: item.node.id, label: item.pathLabel }))}
        defaultOrgId={selected?.id}
        onClose={() => setUserOpen(false)}
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
    </div>
  );
}
