import { Progress } from 'antd';
import { listProjects, projectsKeys } from '../../../api/projects';
import { ModuleEmpty, ModuleFailure, ModuleLoading, useModuleResource } from './ModuleShell';

/**
 * 项目进度模块 —— §7.5：
 * `GET /projects?pageSize=100`，过滤 `status === 'active'`；每行名称 + 进度条 + 百分比。
 *
 * 百分比直接用接口返回的 `progress`（服务端已四舍五入），前端不再自己算（§6.2）。
 */
export function ProjectProgressModule() {
  const resource = useModuleResource({
    queryKey: projectsKeys.list({ page: 1, pageSize: 100 }),
    queryFn: () => listProjects({ page: 1, pageSize: 100 }),
  });

  if (resource.status === 'loading') return <ModuleLoading />;
  if (resource.status === 'error') {
    return <ModuleFailure message={resource.message} onRetry={resource.retry} />;
  }

  const active = resource.data.items.filter((project) => project.status === 'active');
  if (active.length === 0) return <ModuleEmpty text="还没有进行中的项目" />;

  return (
    <div className="wb-project-scroll">
      {active.map((project) => (
        <div className="wb-project-row" key={project.id}>
          <span className="wb-project-name" title={project.name}>
            {project.name}
          </span>
          <Progress
            percent={project.progress}
            size={['100%', 7]}
            showInfo={false}
            strokeColor="var(--primary)"
            trailColor="#eef1f6"
          />
          <span className="wb-project-percent">{project.progress}%</span>
        </div>
      ))}
    </div>
  );
}
