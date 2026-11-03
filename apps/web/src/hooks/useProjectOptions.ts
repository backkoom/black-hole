import { useQuery } from '@tanstack/react-query';
import type { Project } from '@workbench/shared/types';
import { listProjects } from '../api/projects';

/**
 * 项目下拉选项 —— 任务页的「所属项目」筛选与任务表单的「所属项目」都要用。
 *
 * 接口分页最大 pageSize=100，这里一次取满 100 条作为下拉候选。
 * 普通用户拿到的是自己的项目，管理员拿到的是全员项目（服务端行为）。
 */
export function useProjectOptions() {
  return useQuery({
    queryKey: ['projects', 'options'],
    queryFn: async (): Promise<Project[]> => {
      const data = await listProjects({ page: 1, pageSize: 100 });
      return data.items;
    },
    staleTime: 60_000,
  });
}

/** 项目 → 下拉选项 */
export function toProjectOptions(
  projects: Project[] | undefined,
  /** 只保留归属人匹配的项目（服务端按任务归属人校验 project_id） */
  ownerUserId?: number,
): { value: number; label: string }[] {
  if (!projects) return [];
  return projects
    .filter((project) => (ownerUserId === undefined ? true : project.userId === ownerUserId))
    .map((project) => ({ value: project.id, label: project.name }));
}
