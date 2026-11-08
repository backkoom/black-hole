import { useState } from 'react';
import { Button, Card, Pagination, Skeleton } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { listProjects, projectsKeys } from '../api/projects';
import { PageHeader } from '../components/PageHeader';
import { errorStatus, errorText } from '../api/messages';
import { ErrorResult } from '../components/ErrorResult';
import { ProjectCard } from '../components/projects/ProjectCard';
import { ProjectFormModal } from '../components/projects/ProjectFormModal';
import { StateBlock } from '../components/user/StateBlock';

/**
 * 项目管理页 —— pages.md §4 `/projects`。
 *
 * 组件树：
 * ProjectsPage
 * ├─ PageHeader(标题「项目管理」/ 右侧「新建项目」)
 * ├─ ProjectCardGrid(ProjectCard: 名称 / 负责人 / 截止日 / 进度条 / 任务数 / 状态)
 * ├─ ProjectFormModal(新建)
 * └─ Pagination(page 从 1 起，pageSize 默认 20 最大 100)
 *
 * 进度百分比直接用接口返回的 `progress`（服务端实时算），前端不再自己算一遍。
 */

const PAGE_SIZE = 20;

export function ProjectsPage() {
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [formOpen, setFormOpen] = useState(false);

  const listQuery = useQuery({
    queryKey: projectsKeys.list({ page, pageSize }),
    queryFn: () => listProjects({ page, pageSize }),
  });

  return (
    <div className="wb-page">
      <PageHeader
        title="年度工作规划"
        subtitle="按年度规划项目与目标；进度按任务实时计算，点击卡片查看详情与任务。"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
            新建项目
          </Button>
        }
      />

      {listQuery.isError ? (
        <ErrorResult
          status={errorStatus(listQuery.error)}
          text={errorText(listQuery.error)}
          onRetry={() => void listQuery.refetch()}
        />
      ) : listQuery.isPending ? (
        <div className="wb-project-grid">
          {[0, 1, 2, 3].map((key) => (
            <Card key={key} className="wb-project-card">
              <Skeleton active paragraph={{ rows: 4 }} />
            </Card>
          ))}
        </div>
      ) : (listQuery.data?.items.length ?? 0) === 0 ? (
        <Card className="wb-card-flat">
          <StateBlock
            isEmpty
            emptyText="还没有项目"
            emptyHint="新建一个项目，总览、看板、进度追踪里就会跟着出现。"
            emptyAction={
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
                新建项目
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="wb-project-grid">
            {(listQuery.data?.items ?? []).map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onOpen={(target) => void navigate(`/projects/${target.id}`)}
              />
            ))}
          </div>

          <div className="wb-project-pagination">
            <Pagination
              current={page}
              pageSize={pageSize}
              total={listQuery.data?.total ?? 0}
              showSizeChanger
              pageSizeOptions={['10', '20', '50', '100']}
              showTotal={(total) => `共 ${total} 个项目`}
              onChange={(nextPage, nextPageSize) => {
                setPage(nextPage);
                setPageSize(nextPageSize);
              }}
            />
          </div>
        </>
      )}

      <ProjectFormModal open={formOpen} mode="create" onClose={() => setFormOpen(false)} />
    </div>
  );
}
