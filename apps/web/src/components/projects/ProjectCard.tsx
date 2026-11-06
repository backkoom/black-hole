import { Card } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import type { Project } from '@blackhole/shared/types';
import { formatDateOnly } from '../../utils/datetime';
import { ProjectProgress } from './ProjectProgress';
import { ProjectStatusTag } from './ProjectStatusTag';

/**
 * 项目卡片 —— pages.md §4 的 ProjectCard（建议用卡片）。
 *
 * 字段：名称 / 负责人 / 截止日 / 进度条 / 任务数 / 状态标签。
 * 进度百分比直接取接口的 `progress`（服务端实时算好），前端不再算一遍。
 */

interface ProjectCardProps {
  project: Project;
  /** 点击卡片进详情 */
  onOpen: (project: Project) => void;
}

export function ProjectCard({ project, onOpen }: ProjectCardProps) {
  const done = project.doneItems;
  const total = project.totalItems;

  return (
    <Card
      className="wb-project-card"
      hoverable
      onClick={() => onOpen(project)}
      role="button"
      tabIndex={0}
      aria-label={`查看项目 ${project.name}`}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(project);
        }
      }}
    >
      <div className="wb-project-card-head">
        <span className="wb-project-card-title">{project.name}</span>
        <ProjectStatusTag status={project.status} />
      </div>

      <div className="wb-project-card-meta">
        <span>负责人：{project.owner ?? '未指定'}</span>
        <span>截止日：{formatDateOnly(project.dueDate)}</span>
      </div>

      <ProjectProgress project={project} />

      <div className="wb-project-card-foot">
        <span className="wb-muted">
          任务 {done} / {total}
        </span>
        <span className="wb-project-card-link" aria-hidden="true">
          查看详情 <ArrowRightOutlined />
        </span>
      </div>
    </Card>
  );
}
