import { useMemo } from 'react';
import { Button } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { listRisks } from '../api/risks';
import { listIdeas } from '../api/ideas';
import { listFiles } from '../api/files';
import { listMeetings } from '../api/schedule';
import { useAllTasks } from '../hooks/useAllTasks';
import { useUserProjects } from '../hooks/useUserData';
import { useTaskCounts } from '../hooks/useTaskCounts';
import { useMilestones } from '../components/gantt/useMilestones';
import { todayShanghaiDate } from '../utils/datetime';
import { designVars } from '../styles/theme';
import { PageHeader } from '../components/PageHeader';
import { TodayTasks, TodayAgenda } from '../components/workbench/TodayPanel';
import { WorkbenchKpi } from '../components/workbench/WorkbenchKpi';
import { WorkGantt } from '../components/workbench/WorkGantt';
import {
  ProjectStackCard,
  RecentTaskTableCard,
  StatusRiskCard,
} from '../components/workbench/WorkbenchPanels';

/**
 * 工作台（D-36 定稿版）。
 *
 * 版式（与老六确认的 demo 一致）：
 *   标题 + 四个状态胶囊
 *   KPI 四卡（本周 / 本月 / 本季 / 本年工作）
 *   工作进度(8)            任务状态+风险(4)
 *   今天(4)  日程(4)       项目栈(4：在办项目/随记/文件资料)
 *   最近的到期任务（通栏）
 *
 * 数据全部真实：
 * - KPI/任务表/今日待办：GET /api/tasks（全量，前端按 dueDate 分桶）
 * - 甘特：/api/projects + /api/milestones
 * - 状态：/api/stats/tasks；风险：/api/risks?status=open
 * - 项目栈：/api/projects + /api/ideas + /api/files
 */
export function OverviewPage() {
  const navigate = useNavigate();
  const today = todayShanghaiDate();

  const tasksQuery = useAllTasks();
  const tasks = tasksQuery.data ?? [];
  const projectsQuery = useUserProjects();
  const projects = projectsQuery.data?.items ?? [];
  const activeProjects = useMemo(() => projects.filter((p) => p.status === 'active'), [projects]);
  const { counts, query: countsQuery } = useTaskCounts();
  const milestonesQuery = useMilestones();

  const risksQuery = useQuery({
    queryKey: ['workbench', 'risks'],
    queryFn: () => listRisks({ status: 'open' }),
    staleTime: 60_000,
  });
  const ideasQuery = useQuery({
    queryKey: ['workbench', 'ideas'],
    queryFn: () => listIdeas({ page: 1, pageSize: 3 }),
    staleTime: 60_000,
  });
  const filesQuery = useQuery({
    queryKey: ['workbench', 'files'],
    queryFn: () => listFiles(),
    staleTime: 60_000,
  });
  const meetingsQuery = useQuery({
    queryKey: ['workbench', 'meetings', today],
    queryFn: () => listMeetings({ from: `${today}T00:00:00+08:00`, to: `${today}T23:59:59+08:00` }),
    staleTime: 60_000,
  });

  const todayTodo = tasks.filter((task) => task.dueDate === today && task.status !== 'done').length;
  const overdue = tasks.filter((task) => task.dueDate !== null && task.dueDate < today && task.status !== 'done').length;
  const meetings = meetingsQuery.data ?? [];

  const chips = [
    { label: '在办项目', value: activeProjects.length, color: designVars.primary },
    { label: '今日待办', value: todayTodo, color: designVars.orange },
    { label: '今日会议', value: meetings.length, color: designVars.green },
    { label: '已逾期', value: overdue, color: designVars.red },
  ];

  return (
    <div className="wb-page wb-workbench">
      <PageHeader
        title="工作台"
        subtitle="今天做什么、这周推进到哪，一屏看完。"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => void navigate('/projects?view=tasks')}>
            新建任务
          </Button>
        }
      />

      <div className="wb-hero-chips">
        {chips.map((chip) => (
          <span key={chip.label} className="wb-hero-chip">
            <i style={{ background: chip.color }} />
            {chip.label} <b>{chip.value}</b>
          </span>
        ))}
      </div>

      <WorkbenchKpi tasks={tasks} />

      <div className="wb-grid">
        <div className="wb-hb-8 wb-fix-400">
          <WorkGantt
            projects={activeProjects}
            milestones={milestonesQuery.data ?? []}
            onMore={() => void navigate('/projects?view=progress')}
          />
        </div>
        <div className="wb-hb-4 wb-fix-400">
          <StatusRiskCard
            counts={counts}
            risks={risksQuery.data ?? []}
            overdue={overdue}
            onMoreStatus={() => void navigate('/projects?view=tasks')}
            onMoreRisks={() => void navigate('/projects?view=risks')}
          />
        </div>

        <div className="wb-hb-4 wb-fix-267">
          <div className="wb-panel-plain">
            <div className="wb-panel-plain-head">
              <h3>今天</h3>
              <span>{todayTodo} 条待办</span>
              <button type="button" onClick={() => void navigate('/projects?view=tasks&due=today')}>
                全部 →
              </button>
            </div>
            <div className="wb-panel-plain-body">
              <TodayTasks projects={activeProjects} hideHead />
            </div>
          </div>
        </div>

        <div className="wb-hb-4 wb-fix-267">
          <div className="wb-panel-plain">
            <div className="wb-panel-plain-head">
              <h3>日程</h3>
              <span>今天 {meetings.length} 场</span>
              <button type="button" onClick={() => void navigate('/calendar')}>
                去日历 →
              </button>
            </div>
            <div className="wb-panel-plain-body">
              <TodayAgenda hideHead />
            </div>
          </div>
        </div>

        <div className="wb-hb-4 wb-fix-267">
          <ProjectStackCard
            projects={activeProjects}
            ideas={ideasQuery.data?.items ?? []}
            files={filesQuery.data ?? []}
            onOpenProject={() => void navigate('/projects?view=projects')}
            onOpenIdea={() => void navigate('/workspace')}
            onOpenFile={() => void navigate('/files')}
          />
        </div>

        <div className="wb-hb-12">
          <RecentTaskTableCard
            tasks={tasks}
            onOpenAll={() => void navigate('/projects?view=tasks')}
          />
        </div>
      </div>

      {countsQuery.isError ? <div className="wb-panel-empty">任务统计加载失败</div> : null}
    </div>
  );
}
