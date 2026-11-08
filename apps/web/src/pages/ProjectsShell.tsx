import { useMemo } from 'react';
import { Tabs } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ProjectsPage } from './ProjectsPage';
import { KanbanPage } from './KanbanPage';
import { TasksPage } from './TasksPage';
import { ProgressPage } from './ProgressPage';
import { RisksPage } from './RisksPage';
import '../styles/projects-shell.css';

/**
 * 项目管理（模块外壳）—— D-23（2026-11-08 老六定的二期 IA 重构）。
 *
 * 二期之前：看板 / 任务 / 进度 / 风险 / 项目档案 **五个平级入口**，
 * 但它们读的是同一批 task + project 数据，只是渲染方式不同：
 *   - 看板 = 按状态分列（listTasks + fetchTaskStats）
 *   - 任务 = 表格（listTasks）
 *   - 进度 = 按项目聚合的甘特（projects + milestones）
 *   - 风险 = 挂在 project_id 上的属性
 * 放在导航里平铺，等于把"项目管理"拆成 5 个入口，还把"团队工作台"的
 * 其他模块（团队/日程/文件/统计）挤到后面。
 *
 * 现在收成一个模块，进去后顶部 tab 切换 5 个视图；URL 用 `?view=`：
 *   /projects?view=projects | board | tasks | progress | risks
 * 旧路径（/kanban、/tasks、/progress、/risks）在 App.tsx 里重定向到对应 view，
 * 书签和老链接不会 404。
 *
 * ⚠️ 只做"外壳 + 路由"，五个页面组件本身没改 —— 各自保留 PageHeader 与数据逻辑，
 * 这样出问题时能单独回退某一个视图。
 */
const VIEWS = ['projects', 'board', 'tasks', 'progress', 'risks'] as const;
type View = (typeof VIEWS)[number];

const LABELS: Record<View, string> = {
  projects: '档案',
  board: '看板',
  tasks: '任务',
  progress: '进度',
  risks: '风险',
};

export function ProjectsShell() {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();

  const view = useMemo<View>(() => {
    const raw = params.get('view') as View | null;
    // 普通用户没有"项目档案"（那是维护页面，仅管理员）
    const allowed: View[] = isAdmin ? [...VIEWS] : ['board', 'tasks', 'progress', 'risks'];
    if (raw && allowed.includes(raw)) return raw;
    return isAdmin ? 'projects' : 'board';
  }, [params, isAdmin]);

  const items = useMemo(
    () =>
      (isAdmin ? VIEWS : (['board', 'tasks', 'progress', 'risks'] as View[])).map((key) => ({
        key,
        label: LABELS[key],
      })),
    [isAdmin],
  );

  return (
    <div className="wb-page">
      <div className="wb-project-shell">
        <Tabs
          activeKey={view}
          items={items}
          // replace：切视图不往历史里塞一堆记录，后退还是回上一页
          onChange={(key) => setParams({ view: key }, { replace: true })}
        />
      </div>

      {view === 'projects' && isAdmin ? <ProjectsPage /> : null}
      {view === 'board' ? <KanbanPage /> : null}
      {view === 'tasks' ? <TasksPage /> : null}
      {view === 'progress' ? <ProgressPage /> : null}
      {view === 'risks' ? <RisksPage /> : null}
    </div>
  );
}
