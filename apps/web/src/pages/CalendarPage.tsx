import { useMemo, useState } from 'react';
import { Button } from 'antd';
import {
  CalendarOutlined,
  CheckSquareOutlined,
  FlagOutlined,
  LeftOutlined,
  RightOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import type { Meeting, Milestone, Priority, Task } from '@workbench/shared/types';
import { listMeetings, listMilestones, scheduleKeys } from '../api/schedule';
import { useAllTasks } from '../hooks/useAllTasks';
import { useUserProjects } from '../hooks/useUserData';
import { useTaskCounts } from '../hooks/useTaskCounts';
import {
  formatChineseDateWithWeekday,
  formatDateOnly,
  formatDateTime,
  toCalendarDate,
  todayShanghaiDate,
} from '../utils/datetime';
import {
  WEEK_LABELS,
  addDays,
  buildMonthGrid,
  diffDays,
  formatMonthDay,
  instantOf,
  isoDayRange,
  monthKeyOf,
  formatMonthLabel,
  shiftMonth,
  shanghaiDayOf,
  nowInstant,
} from '../utils/calendar';
import { dailyDateSeries, seriesDelta } from '../utils/trend';
import { designVars } from '../styles/theme';
import { AvatarGroup, MetricCard, Panel, STATUS_TONE, ToneTag } from '../components/ui';
import type { TagTone } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { StateBlock } from '../components/user/StateBlock';
import { getLunarInfo, lunarText } from '../utils/lunar';
import { HOLIDAY_SOURCES, getHoliday } from '../data/holidays';
import '../styles/calendar.css';

/**
 * 日程安排页（老六最终用户端界面 · 稿子图4「日程安排」）。
 *
 * 组件树：
 * CalendarPage
 * ├─ PageHeader（「日程安排」+ 副标题 + 右侧日期/日历按钮）
 * ├─ .wb-metric-grid（4 张指标卡）
 * └─ .wb-grid（12 列栅格）
 *    ├─ .wb-grid-left（约 2/3）
 *    │  ├─ Panel「日历视图」：月切换 + 月历网格（周一起始；有任务的日期画彩色圆点）
 *    │  ├─ Panel「今日会议」：时间 / 标题 / 地点·项目 / 参与人头像组 / 状态标签
 *    │  └─ Panel「任务提醒」：时间 / 标题 / 优先级标签
 *    └─ .wb-grid-right（约 1/3）
 *       ├─ Panel「今日时间轴」：‹ 日期 › + 按时间排序的条目（会议 + 任务）
 *       ├─ Panel「重要里程碑」：日期 / 名称 / 「N 天后」标签
 *       └─ Panel「近期日程」：日期 / 圆点 / 标题 / 时间 / 地点
 *
 * 数据口径（全部来自真实接口，没有 mock）：
 * - 会议：
 *   - GET /api/meetings（不带区间）→ 该账号可见的全部会议，供「会议安排」指标卡、
 *     「今日会议」「近期日程」与 7 天趋势使用；
 *   - GET /api/meetings?from=&to= → 时间轴面板当前选中日的那一天（区间按 start_at 过滤，
 *     所以 from/to 必须是带 +08:00 时区的完整 ISO，不能只传 YYYY-MM-DD）。
 * - 任务：GET /api/tasks（useAllTasks 按服务端分页上限 100 逐页取全）。
 *   接口没有按 startAt / reminderAt 筛选的能力，所以月历圆点、时间轴、任务提醒
 *   都在本地按真实字段归组：
 *   - 任务归属日 = startAt 所在日 ∪ dueDate 所在日（既有开始日又有截止日就占两天）；
 *   - 逾期红 = 状态非 done 且 dueDate 早于今天；
 * - 里程碑：GET /api/milestones（无分页，服务端按 dueDate 升序）；
 * - 项目成员：GET /api/projects?pageSize=100 —— 会议表没有参与人字段，
 *   会议的头像组用**该会议所属项目的人**（成员 + 负责人，都是接口返回的真实姓名；
 *   没有项目就没有头像）。
 *
 * ⚠️ 会议表没有 status 字段，状态标签是按当前时间与 startAt/endAt 推出来的
 *    （未开始 / 进行中 / 已结束），不是编造的数据。
 */

const PRIORITY_LABEL: Record<Priority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

/** 任务状态 → 圆点/标签颜色（todo 灰 / doing 蓝 / done 绿 / 逾期红） */
function taskTone(task: Task, today: string): { tone: TagTone; color: string } {
  const due = toCalendarDate(task.dueDate);
  if (task.status !== 'done' && due !== null && due < today) {
    return { tone: 'red', color: designVars.red };
  }
  if (task.status === 'doing') return { tone: 'blue', color: designVars.primary };
  if (task.status === 'done') return { tone: 'green', color: designVars.green };
  return { tone: 'gray', color: designVars.muted };
}

/** 会议状态：表里没有 status，按当前时间与 startAt/endAt 推 */
function meetingTone(meeting: Meeting): { tone: TagTone; color: string; label: string } {
  const start = instantOf(meeting.startAt);
  const end = meeting.endAt ? instantOf(meeting.endAt) : Number.NaN;
  const now = nowInstant();
  if (!Number.isNaN(end) && now > end) {
    return { tone: 'gray', color: designVars.muted, label: '已结束' };
  }
  if (!Number.isNaN(start) && now >= start) {
    return { tone: 'green', color: designVars.statusDoing, label: '进行中' };
  }
  return { tone: 'orange', color: designVars.orange, label: '未开始' };
}

/** 时间戳 → HH:mm（东八区） */
function clockOf(value: string | null | undefined): string {
  if (!value) return '';
  const text = formatDateTime(value);
  return text === '—' ? '' : text.slice(11);
}

/** 会议的时间区间：09:00-10:00 */
function meetingRange(meeting: Meeting): string {
  const start = clockOf(meeting.startAt);
  const end = clockOf(meeting.endAt);
  if (!start) return '';
  return end ? `${start}-${end}` : start;
}

/** 时间轴上的一条 */
interface TimelineEntry {
  key: string;
  /** 左侧时间区间 */
  time: string;
  /** 彩色圆点 */
  color: string;
  title: string;
  subtitle: string;
  /** 头像组（真实姓名） */
  people: string[];
  statusLabel: string;
  statusTone: TagTone;
}

/** 时间轴最多显示的条目数 */
const TIMELINE_LIMIT = 8;
/** 今日会议折叠时最多显示几条 */
const MEETING_PREVIEW = 4;
/** 里程碑折叠时最多显示几条 */
const MILESTONE_PREVIEW = 4;
/** 任务提醒最多显示几条 */
const REMINDER_LIMIT = 5;
/** 近期日程最多显示几条 */
const UPCOMING_LIMIT = 5;

export function CalendarPage() {
  const today = todayShanghaiDate();

  /** 时间轴当前看哪天 —— 默认今天 */
  const [selectedDate, setSelectedDate] = useState(today);
  /** 月历翻到的月份 */
  const [monthKey, setMonthKey] = useState(monthKeyOf(today));
  const [expandedMeetings, setExpandedMeetings] = useState(false);
  const [expandedMilestones, setExpandedMilestones] = useState(false);

  const tasksQuery = useAllTasks();
  const projectsQuery = useUserProjects();
  const { counts: taskCounts } = useTaskCounts();

  /** 全部会议（账号可见范围） */
  const meetingsQuery = useQuery({
    queryKey: scheduleKeys.meetings({}),
    queryFn: () => listMeetings(),
    staleTime: 30_000,
  });

  /** 时间轴选中日的会议 —— 区间按 start_at 过滤，from/to 带 +08:00 时区 */
  const dayRange = useMemo(() => isoDayRange(selectedDate, selectedDate), [selectedDate]);
  const dayMeetingsQuery = useQuery({
    queryKey: scheduleKeys.meetings(dayRange),
    queryFn: () => listMeetings(dayRange),
    staleTime: 30_000,
  });

  const milestonesQuery = useQuery({
    queryKey: scheduleKeys.milestones(),
    queryFn: () => listMilestones(),
    staleTime: 30_000,
  });

  const tasks = tasksQuery.data ?? [];
  const meetings = meetingsQuery.data ?? [];
  const dayMeetings = dayMeetingsQuery.data ?? [];
  const milestones = milestonesQuery.data ?? [];
  const projects = projectsQuery.data?.items ?? [];

  /** 项目 id → 相关人员姓名（会议参与人头像组用） */
  const projectPeople = useMemo(() => {
    const map = new Map<number, string[]>();
    projects.forEach((project) => {
      const names = new Set<string>(project.members);
      if (project.owner) names.add(project.owner);
      map.set(project.id, [...names]);
    });
    return map;
  }, [projects]);

  /** 月历格子（周一起始，dayjs 生成） */
  const cells = useMemo(() => buildMonthGrid(monthKey), [monthKey]);

  /** 任务归属日 → 任务列表（startAt 日 ∪ dueDate 日） */
  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    const push = (day: string, task: Task): void => {
      if (!day) return;
      const list = map.get(day) ?? [];
      list.push(task);
      map.set(day, list);
    };
    tasks.forEach((task) => {
      const days = new Set<string>();
      if (task.startAt) days.add(shanghaiDayOf(task.startAt));
      const due = toCalendarDate(task.dueDate);
      if (due) days.add(due);
      days.forEach((day) => push(day, task));
    });
    return map;
  }, [tasks]);

  /** 今天的会议 */
  const todayMeetings = useMemo(
    () => meetings.filter((meeting) => shanghaiDayOf(meeting.startAt) === today),
    [meetings, today],
  );

  /** 未来的会议（近期日程） */
  const upcomingMeetings = useMemo(
    () =>
      meetings
        .filter((meeting) => instantOf(meeting.startAt) >= nowInstant())
        .sort((a, b) => (a.startAt < b.startAt ? -1 : 1)),
    [meetings],
  );

  /** 提醒任务（今天及以后，按提醒时间升序） */
  const reminderTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.reminderAt !== null && shanghaiDayOf(task.reminderAt) >= today)
        .sort((a, b) => ((a.reminderAt ?? '') < (b.reminderAt ?? '') ? -1 : 1)),
    [tasks, today],
  );

  /** 时间轴条目：选中日的会议 + 当天的任务（有 startAt 的按开始时间排，其余算全天） */
  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [];

    dayMeetings.forEach((meeting) => {
      const tone = meetingTone(meeting);
      const members =
        meeting.projectId === null ? [] : (projectPeople.get(meeting.projectId) ?? []);
      entries.push({
        key: `meeting-${meeting.id}`,
        time: meetingRange(meeting),
        color: tone.color,
        title: meeting.title,
        subtitle:
          [meeting.location, meeting.projectName].filter(Boolean).join(' · ') || '未设置地点',
        people: members,
        statusLabel: tone.label,
        statusTone: tone.tone,
      });
    });

    (tasksByDay.get(selectedDate) ?? []).forEach((task) => {
      const tone = taskTone(task, today);
      const startsToday = task.startAt !== null && shanghaiDayOf(task.startAt) === selectedDate;
      const overdue = tone.tone === 'red';
      entries.push({
        key: `task-${task.id}`,
        time: startsToday ? clockOf(task.startAt) : '',
        color: tone.color,
        title: task.title,
        subtitle: [
          task.projectName ?? '未归属项目',
          task.assigneeName ? `负责人 ${task.assigneeName}` : '未指派',
          startsToday ? '' : `截止 ${formatDateOnly(task.dueDate)}`,
        ]
          .filter(Boolean)
          .join(' · '),
        people: task.assigneeName ? [task.assigneeName] : [],
        statusLabel: overdue
          ? '逾期'
          : task.status === 'doing'
            ? '进行中'
            : task.status === 'done'
              ? '已完成'
              : '待处理',
        statusTone: tone.tone,
      });
    });

    // 按时间排序：没有具体时间的排在后面
    return entries.sort((a, b) => {
      if (a.time === b.time) return 0;
      if (!a.time) return 1;
      if (!b.time) return -1;
      return a.time < b.time ? -1 : 1;
    });
  }, [dayMeetings, tasksByDay, selectedDate, projectPeople, today]);

  /** 近 7 天的日程条目数（会议 + 任务），给指标卡做迷你折线 */
  const agendaTrend = useMemo(() => {
    const starts = [
      ...meetings.map((meeting) => meeting.startAt),
      ...tasks.map((task) => task.startAt),
    ];
    return dailyDateSeries(starts);
  }, [meetings, tasks]);

  /** 近 7 天的会议数 */
  const meetingTrend = useMemo(
    () => dailyDateSeries(meetings.map((meeting) => meeting.startAt)),
    [meetings],
  );

  /** 今日日程条目数（今天的会议 + 今天的任务） */
  const todayAgenda = useMemo(() => {
    const meetingCount = todayMeetings.length;
    const taskCount = (tasksByDay.get(today) ?? []).length;
    return { total: meetingCount + taskCount, meetings: meetingCount, tasks: taskCount };
  }, [todayMeetings, tasksByDay, today]);

  /** 尚未开始的会议数 */
  const pendingMeetingCount = useMemo(
    () => meetings.filter((meeting) => instantOf(meeting.startAt) >= nowInstant()).length,
    [meetings],
  );

  /** 里程碑按到期日升序（无到期日排最后） */
  const sortedMilestones = useMemo(
    () =>
      [...milestones].sort((a, b) => {
        const left = toCalendarDate(a.dueDate);
        const right = toCalendarDate(b.dueDate);
        if (left === right) return 0;
        if (left === null) return 1;
        if (right === null) return -1;
        return left < right ? -1 : 1;
      }),
    [milestones],
  );

  const pendingMilestones = milestones.filter((item) => item.status === 'pending').length;

  const meetingList = expandedMeetings ? todayMeetings : todayMeetings.slice(0, MEETING_PREVIEW);
  const milestoneList = expandedMilestones
    ? sortedMilestones
    : sortedMilestones.slice(0, MILESTONE_PREVIEW);
  const reminderList = reminderTasks.slice(0, REMINDER_LIMIT);
  const upcomingList = upcomingMeetings.slice(0, UPCOMING_LIMIT);
  const timelineVisible = timelineEntries.slice(0, TIMELINE_LIMIT);

  const selectDate = (date: string): void => {
    setSelectedDate(date);
    // 点到补位格（上月/下月）时跟着翻到那个月
    if (monthKeyOf(date) !== monthKey) setMonthKey(monthKeyOf(date));
  };

  const goToday = (): void => {
    setSelectedDate(today);
    setMonthKey(monthKeyOf(today));
  };

  const renderMilestoneTag = (milestone: Milestone): JSX.Element => {
    if (milestone.status === 'done') {
      return <ToneTag tone="green">已完成</ToneTag>;
    }
    const due = toCalendarDate(milestone.dueDate);
    if (due === null) {
      return <ToneTag tone="gray">未设置日期</ToneTag>;
    }
    const days = diffDays(today, due);
    if (days < 0) {
      return <ToneTag tone="red">已逾期 {Math.abs(days)} 天</ToneTag>;
    }
    if (days === 0) {
      return <ToneTag tone="orange">今天到期</ToneTag>;
    }
    return <ToneTag tone="blue">{days} 天后</ToneTag>;
  };

  return (
    <div className="wb-page">
      <PageHeader
        title="日程安排"
        subtitle="管理项目日程，安排会议与重要事项，高效规划团队工作"
      />

      {/* 4 张指标卡 */}
      <div className="wb-metric-grid">
        <MetricCard
          label="今日日程"
          value={todayAgenda.total}
          icon={<CalendarOutlined />}
          iconColor={designVars.primary}
          delta={seriesDelta(agendaTrend)}
          trend={agendaTrend}
          hint={`会议 ${todayAgenda.meetings} 场 · 任务 ${todayAgenda.tasks} 项`}
        />
        <MetricCard
          label="会议安排"
          value={meetings.length}
          icon={<TeamOutlined />}
          iconColor={designVars.green}
          delta={seriesDelta(meetingTrend)}
          trend={meetingTrend}
          hint={`今日 ${todayMeetings.length} 场 · 未开始 ${pendingMeetingCount} 场`}
        />
        <MetricCard
          label="待办事项"
          value={taskCounts.todo}
          icon={<CheckSquareOutlined />}
          iconColor={designVars.orange}
          hint={`共 ${taskCounts.total} 项 · 进行中 ${taskCounts.doing} 项`}
        />
        <MetricCard
          label="重要里程碑"
          value={milestones.length}
          icon={<FlagOutlined />}
          iconColor={designVars.purple}
          hint={`未完成 ${pendingMilestones} 个`}
        />
      </div>

      <div className="wb-grid">
        {/* 左列：日历视图 + 今日会议 + 任务提醒 */}
        <div className="wb-grid-left">
          <Panel
            title="日历视图"
            extra={
              <div className="wb-cal-nav">
                <Button
                  type="text"
                  size="small"
                  icon={<LeftOutlined />}
                  aria-label="上一月"
                  onClick={() => setMonthKey((prev) => shiftMonth(prev, -1))}
                />
                <span className="wb-cal-month">{formatMonthLabel(monthKey)}</span>
                <Button
                  type="text"
                  size="small"
                  icon={<RightOutlined />}
                  aria-label="下一月"
                  onClick={() => setMonthKey((prev) => shiftMonth(prev, 1))}
                />
                <Button size="small" onClick={goToday}>
                  今天
                </Button>
              </div>
            }
            flush
          >
            <div className="wb-cal-body">
              <div className="wb-cal-weekhead">
                {WEEK_LABELS.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>
              <div className="wb-cal-grid">
                {cells.map((cell) => {
                  const dayTasks = tasksByDay.get(cell.date) ?? [];
                  const lunar = getLunarInfo(cell.date);
                  const holiday = getHoliday(cell.date);
                  const cellClass = [
                    'wb-cal-cell',
                    cell.inMonth ? '' : 'is-outside',
                    cell.date === today ? 'is-today' : '',
                    cell.date === selectedDate ? 'is-selected' : '',
                    holiday?.kind === 'off' ? 'is-holiday' : '',
                    holiday?.kind === 'work' ? 'is-makeup' : '',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <button
                      type="button"
                      key={cell.date}
                      className={cellClass}
                      onClick={() => selectDate(cell.date)}
                      title={`${cell.date} ${lunarText(cell.date)}${lunar.term ? ` · ${lunar.term}` : ''}${
                        holiday ? ` · ${holiday.name}${holiday.kind === 'off' ? '放假' : '调休上班'}` : ''
                      }`}
                      aria-label={
                        dayTasks.length > 0
                          ? `${cell.date} ${lunar.label} · ${dayTasks.length} 项任务`
                          : `${cell.date} ${lunar.label} · 暂无任务`
                      }
                    >
                      <span className="wb-cal-day-row">
                        <span className="wb-cal-day">{cell.day}</span>
                        {holiday ? (
                          <span className={`wb-cal-badge is-${holiday.kind}`}>
                            {holiday.kind === 'off' ? '休' : '班'}
                          </span>
                        ) : null}
                      </span>
                      <span className={`wb-cal-lunar${lunar.highlight ? ' is-festival' : ''}`}>
                        {lunar.label}
                      </span>
                      {dayTasks.length > 0 ? (
                        <span className="wb-cal-dots">
                          {dayTasks.slice(0, 4).map((task) => (
                            <i
                              key={`dot-${task.id}-${cell.date}`}
                              className="wb-cal-dot"
                              style={{ background: taskTone(task, today).color }}
                            />
                          ))}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <div className="wb-cal-legend">
                <span className="wb-cal-legend-item">
                  <i className="wb-cal-dot" style={{ background: designVars.muted }} />
                  待处理
                </span>
                <span className="wb-cal-legend-item">
                  <i className="wb-cal-dot" style={{ background: designVars.primary }} />
                  进行中
                </span>
                <span className="wb-cal-legend-item">
                  <i className="wb-cal-dot" style={{ background: designVars.green }} />
                  已完成
                </span>
                <span className="wb-cal-legend-item">
                  <i className="wb-cal-dot" style={{ background: designVars.red }} />
                  逾期
                </span>
                <span className="wb-cal-legend-item">
                  <i className="wb-cal-badge is-off">休</i>
                  节假日
                </span>
                <span className="wb-cal-legend-item">
                  <i className="wb-cal-badge is-work">班</i>
                  调休上班
                </span>
              </div>
              <div className="wb-cal-legend-note">
                {HOLIDAY_SOURCES[Number(monthKey.slice(0, 4))]
                  ? `节假日数据：${monthKey.slice(0, 4)} 年（${HOLIDAY_SOURCES[Number(monthKey.slice(0, 4))]}）`
                  : `${monthKey.slice(0, 4)} 年节假日安排尚未发布，仅显示农历与节日`}
              </div>
            </div>
          </Panel>

          <Panel
            title="今日会议"
            more={
              expandedMeetings || todayMeetings.length > MEETING_PREVIEW
                ? expandedMeetings
                  ? '收起'
                  : '查看全部'
                : undefined
            }
            onMore={() => setExpandedMeetings((prev) => !prev)}
            flush
          >
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={meetingsQuery.isPending}
                error={meetingsQuery.isError ? meetingsQuery.error : undefined}
                onRetry={() => void meetingsQuery.refetch()}
                isEmpty={todayMeetings.length === 0}
                emptyText="今天没有会议安排"
              >
                {meetingList.map((meeting) => {
                  const tone = meetingTone(meeting);
                  const members =
                    meeting.projectId === null
                      ? []
                      : (projectPeople.get(meeting.projectId) ?? []);
                  return (
                    <div className="wb-cal-row" key={meeting.id}>
                      <span className="wb-cal-row-time">{meetingRange(meeting)}</span>
                      <span className="wb-cal-row-main">
                        <span className="wb-cal-row-title">{meeting.title}</span>
                        <span className="wb-cal-row-sub">
                          {[meeting.location, meeting.projectName].filter(Boolean).join(' · ') ||
                            '未设置地点'}
                        </span>
                      </span>
                      {members.length > 0 ? (
                        <AvatarGroup people={members} max={3} size={22} />
                      ) : null}
                      <ToneTag tone={tone.tone}>{tone.label}</ToneTag>
                    </div>
                  );
                })}
                {!expandedMeetings && todayMeetings.length > meetingList.length ? (
                  <span className="wb-cal-more-hint">
                    还有 {todayMeetings.length - meetingList.length} 场会议，点「查看全部」展开
                  </span>
                ) : null}
              </StateBlock>
            </div>
          </Panel>

          <Panel title="任务提醒" flush>
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={tasksQuery.isPending}
                error={tasksQuery.isError ? tasksQuery.error : undefined}
                onRetry={() => void tasksQuery.refetch()}
                isEmpty={reminderTasks.length === 0}
                emptyText="没有待提醒的任务"
              >
                {reminderList.map((task) => (
                  <div className="wb-cal-row" key={task.id}>
                    <span className="wb-cal-row-time">{clockOf(task.reminderAt)}</span>
                    <span className="wb-cal-row-main">
                      <span className="wb-cal-row-title">{task.title}</span>
                      <span className="wb-cal-row-sub">
                        {task.projectName ?? '未归属项目'}
                      </span>
                    </span>
                    <ToneTag tone={STATUS_TONE[task.priority] ?? 'gray'}>
                      {PRIORITY_LABEL[task.priority]}
                    </ToneTag>
                  </div>
                ))}
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 右列：今日时间轴 + 重要里程碑 + 近期日程 */}
        <div className="wb-grid-right">
          <Panel
            title="今日时间轴"
            extra={
              selectedDate === today ? undefined : (
                <Button size="small" onClick={goToday}>
                  回到今天
                </Button>
              )
            }
            flush
          >
            <div style={{ padding: '0 18px 16px' }}>
              <div className="wb-cal-timeline-nav">
                <Button
                  type="text"
                  size="small"
                  icon={<LeftOutlined />}
                  aria-label="前一天"
                  onClick={() => setSelectedDate((prev) => addDays(prev, -1))}
                />
                <span className="wb-cal-timeline-date">
                  {formatChineseDateWithWeekday(selectedDate)}
                  <span className="wb-cal-timeline-lunar">{lunarText(selectedDate)}</span>
                </span>
                <Button
                  type="text"
                  size="small"
                  icon={<RightOutlined />}
                  aria-label="后一天"
                  onClick={() => setSelectedDate((prev) => addDays(prev, 1))}
                />
              </div>
              <StateBlock
                loading={dayMeetingsQuery.isPending}
                error={dayMeetingsQuery.isError ? dayMeetingsQuery.error : undefined}
                onRetry={() => void dayMeetingsQuery.refetch()}
                isEmpty={timelineEntries.length === 0}
                emptyText="这一天没有日程"
              >
                {timelineVisible.map((entry) => (
                  <div className="wb-cal-timeline-item" key={entry.key}>
                    <span className="wb-cal-timeline-time">{entry.time || '全天'}</span>
                    <i className="wb-cal-dot" style={{ background: entry.color }} />
                    <span className="wb-cal-timeline-body">
                      <span className="wb-cal-timeline-title">{entry.title}</span>
                      <span className="wb-cal-timeline-sub">{entry.subtitle}</span>
                      {entry.people.length > 0 ? (
                        <AvatarGroup people={entry.people} max={3} size={20} />
                      ) : null}
                    </span>
                    <span className="wb-cal-timeline-side">
                      <ToneTag tone={entry.statusTone}>{entry.statusLabel}</ToneTag>
                    </span>
                  </div>
                ))}
                {timelineEntries.length > timelineVisible.length ? (
                  <span className="wb-cal-more-hint">
                    还有 {timelineEntries.length - timelineVisible.length} 项日程
                  </span>
                ) : null}
              </StateBlock>
            </div>
          </Panel>

          <Panel
            title="重要里程碑"
            more={
              expandedMilestones || sortedMilestones.length > MILESTONE_PREVIEW
                ? expandedMilestones
                  ? '收起'
                  : '查看全部'
                : undefined
            }
            onMore={() => setExpandedMilestones((prev) => !prev)}
            flush
          >
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={milestonesQuery.isPending}
                error={milestonesQuery.isError ? milestonesQuery.error : undefined}
                onRetry={() => void milestonesQuery.refetch()}
                isEmpty={milestones.length === 0}
                emptyText="还没有里程碑"
              >
                {milestoneList.map((milestone) => (
                  <div className="wb-cal-row" key={milestone.id}>
                    <span className="wb-cal-row-time">{formatDateOnly(milestone.dueDate)}</span>
                    <span className="wb-cal-row-main">
                      <span className="wb-cal-row-title">{milestone.name}</span>
                      <span className="wb-cal-row-sub">
                        {milestone.projectName ?? '未归属项目'}
                      </span>
                    </span>
                    {renderMilestoneTag(milestone)}
                  </div>
                ))}
              </StateBlock>
            </div>
          </Panel>

          <Panel title="近期日程" flush>
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={meetingsQuery.isPending}
                error={meetingsQuery.isError ? meetingsQuery.error : undefined}
                onRetry={() => void meetingsQuery.refetch()}
                isEmpty={upcomingMeetings.length === 0}
                emptyText="近期没有会议安排"
              >
                {upcomingList.map((meeting) => {
                  const tone = meetingTone(meeting);
                  return (
                    <div className="wb-cal-row" key={meeting.id}>
                      <span className="wb-cal-row-time">{formatMonthDay(meeting.startAt)}</span>
                      <i className="wb-cal-dot" style={{ background: tone.color }} />
                      <span className="wb-cal-row-main">
                        <span className="wb-cal-row-title">{meeting.title}</span>
                        <span className="wb-cal-row-sub">
                          {meetingRange(meeting)} · {meeting.location ?? '未设置地点'}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </StateBlock>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
