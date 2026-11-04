import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Avatar, Button } from 'antd';
import {
  CalendarOutlined,
  CommentOutlined,
  EnvironmentOutlined,
  FileDoneOutlined,
  ProjectOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { Role, UserListItem } from '@workbench/shared/types';
import { listUsers } from '../api/users';
import { listMeetings } from '../api/schedule';
import { errorStatus } from '../api/messages';
import { useUserProjects, useUserTasks } from '../hooks/useUserData';
import {
  currentWeekDates,
  formatDateTime,
  toCalendarDate,
  todayShanghaiDate,
} from '../utils/datetime';
import { designVars } from '../styles/theme';
import { LegendItem, MetricCard, Panel, ToneTag } from '../components/ui';
import type { TagTone } from '../components/ui';
import { DonutChart } from '../components/ui/charts';
import { PageHeader } from '../components/PageHeader';
import { StateBlock } from '../components/user/StateBlock';
import '../styles/team.css';

/**
 * 团队协作页（老六最终用户端界面 · 稿子图6）—— **本期降级版**。
 *
 * 稿子里的「团队公告」「最近讨论」「待我审批」「协作动态」都依赖
 * 即时通讯 / 通知链路，**本期不做**，所以这四块一个都不画
 * （宁缺毋滥 —— 不放「暂无数据」的假面板）。
 *
 * 本期只做四块：
 * ├─ PageHeader（「团队协作」+ 副标题）
 * ├─ .wb-metric-row（4 张指标卡）
 * ├─ .wb-team-grid（12 列栅格）
 * │  ├─ .wb-team-8：Panel「团队成员」（头像 + 姓名 + 角色标签 + 所属组织 + 状态点）
 * │  ├─ .wb-team-4：Panel「角色分工」（环形图，成员按角色分组）
 * │  └─ .wb-team-12：Panel「会议纪要」（标题 + 时间 + 地点 + 项目）
 *
 * 数据口径（全部来自真实接口，没有 mock）：
 * - 成员名单：GET /api/users —— **仅管理员**，普通用户 403；
 *   降级路径：403 时改用 GET /api/projects 的 members（项目成员姓名）∪
 *   GET /api/tasks 的 assigneeName（任务负责人姓名），
 *   此时**角色与组织拿不到**，显示「—」，不编造；
 * - 会议：GET /api/meetings（普通用户看自己的，管理员看全员）。
 * - 今日讨论 = 今天的会议数（讨论数据源本期不存在，用会议数代替并注明）；
 * - 待审批 = 无数据源 → 显示「—」；
 * - 本周会议 = 本周（周一至周日，东八区）的会议数。
 *
 * ⚠️ 「在线状态」没有数据源 —— 接口没有 presence / 在线字段。
 *    面板里的状态点取账号的 status（active / disabled），并用 Tooltip 说明，
 *    不假装是实时在线状态。
 */

/** 角色 → 中文标签 */
const ROLE_LABEL: Record<Role, string> = {
  admin: '管理员',
  user: '普通用户',
};

/** 角色 → 色调 */
const ROLE_TONE: Record<Role, TagTone> = {
  admin: 'purple',
  user: 'blue',
};

/** 降级来源：目录（GET /api/users）还是从项目 / 任务反推出来的成员 */
type MemberSource = 'directory' | 'derived';

/** 面板里的一行成员 */
interface MemberRow {
  id: string;
  name: string;
  /** 降级来源下没有角色 */
  role: Role | null;
  /** 降级来源下没有组织 */
  org: string | null;
  /** 账号状态；降级来源下未知 */
  accountStatus: 'active' | 'disabled' | null;
}

export function TeamPage() {
  const navigate = useNavigate();
  const today = todayShanghaiDate();
  const weekDates = useMemo(() => currentWeekDates(), []);

  const projectsQuery = useUserProjects();
  const tasksQuery = useUserTasks();

  /** 成员目录（仅管理员可见；普通用户会拿到 403） */
  const usersQuery = useQuery({
    queryKey: ['users', 'team-directory'],
    queryFn: async (): Promise<UserListItem[]> => {
      const data = await listUsers({ page: 1, pageSize: 100 });
      return data.items;
    },
    staleTime: 60_000,
    retry: false,
  });

  /** 会议（会议纪要 + 今日 / 本周会议数） */
  const meetingsQuery = useQuery({
    queryKey: ['schedule', 'meetings', 'team'],
    queryFn: () => listMeetings(),
    staleTime: 30_000,
  });

  const meetings = meetingsQuery.data ?? [];
  const projects = projectsQuery.data?.items ?? [];
  const tasks = tasksQuery.data?.items ?? [];

  /**
   * 成员名单与来源：
   * - 目录可用（管理员）→ 用账号列表，角色 / 组织 / 账号状态齐全；
   * - 目录 403（普通用户）→ 降级成「项目成员 ∪ 任务负责人」的姓名去重，
   *   角色与组织显示「—」。
   */
  const { members, source } = useMemo<{ members: MemberRow[]; source: MemberSource }>(() => {
    if (usersQuery.isSuccess) {
      return {
        source: 'directory',
        members: usersQuery.data.map((user) => ({
          id: `u-${user.id}`,
          name: user.name,
          role: user.role,
          org: user.org.dept ? `${user.org.company} / ${user.org.dept}` : user.org.company,
          accountStatus: user.status,
        })),
      };
    }
    const names = new Set<string>();
    projects.forEach((project) => project.members.forEach((name) => names.add(name)));
    tasks.forEach((task) => {
      if (task.assigneeName) names.add(task.assigneeName);
    });
    return {
      source: 'derived',
      members: [...names].map((name, index) => ({
        id: `d-${index}-${name}`,
        name,
        role: null,
        org: null,
        accountStatus: null,
      })),
    };
  }, [usersQuery.isSuccess, usersQuery.data, projects, tasks]);

  /** 角色分布（只有目录来源才有角色信息） */
  const roleSegments = useMemo(() => {
    const admins = members.filter((member) => member.role === 'admin').length;
    const users = members.filter((member) => member.role === 'user').length;
    return [
      { name: '管理员', value: admins, color: designVars.purple },
      { name: '普通用户', value: users, color: designVars.primary },
    ];
  }, [members]);

  /** 今天的会议数（代替「今日讨论」） */
  const todayMeetings = useMemo(() => {
    return meetings.filter((meeting) => toCalendarDate(meeting.startAt) === today);
  }, [meetings, today]);

  /** 本周（周一至周日，东八区）的会议数 */
  const weekMeetings = useMemo(() => {
    const week = new Set(weekDates);
    return meetings.filter((meeting) => {
      const day = toCalendarDate(meeting.startAt);
      return day !== null && week.has(day);
    });
  }, [meetings, weekDates]);

  /** 会议纪要：每条会议当一份纪要（标题 / 时间 / 地点 / 项目），按开始时间倒序 */
  const minutes = useMemo(() => {
    return [...meetings].sort((a, b) => (a.startAt < b.startAt ? 1 : -1));
  }, [meetings]);

  /** 成员列表的错误：只有 403（普通用户无权限）才走降级，其余错误照常显示 */
  const directoryError =
    usersQuery.isError && usersQuery.error ? usersQuery.error : undefined;
  const forbidden = errorStatus(directoryError) === 403;

  /** 成员面板的加载态：三个来源都还没回来 */
  const membersLoading =
    usersQuery.isPending || projectsQuery.isPending || tasksQuery.isPending;

  const metricCards = [
    {
      label: '团队成员数',
      value: members.length,
      icon: <TeamOutlined />,
      color: designVars.primary,
      hint: source === 'directory' ? '账号目录中的成员' : '项目成员与任务负责人去重',
    },
    {
      label: '今日讨论',
      value: todayMeetings.length,
      icon: <CommentOutlined />,
      color: designVars.green,
      hint: '讨论数据源未接入，暂以今日会议数代替',
    },
    {
      label: '待审批',
      value: '—',
      icon: <FileDoneOutlined />,
      color: designVars.orange,
      hint: '审批链路本期未接入',
    },
    {
      label: '本周会议',
      value: weekMeetings.length,
      color: designVars.purple,
      icon: <CalendarOutlined />,
      hint: '周一至周日（东八区）',
    },
  ];

  return (
    <div className="wb-page">
      <PageHeader title="团队协作" subtitle="查看成员分工与会议纪要，了解团队协作节奏" />

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

      <div className="wb-team-grid">
        {/* 团队成员 */}
        <div className="wb-team-8">
          <Panel
            title="团队成员"
            extra={
              <span className="wb-muted">
                {source === 'directory' ? '账号目录' : '项目与任务反推'}
              </span>
            }
            flush
          >
            <div style={{ padding: '0 18px 16px' }}>
              {forbidden ? (
                <div className="wb-team-notice">
                  <div className="wb-team-notice-title">需要管理员权限查看</div>
                  <div className="wb-team-notice-text">
                    完整的成员名单（角色、所属组织、账号状态）来自账号管理接口，仅管理员可访问。
                    下方列表已降级为项目成员与任务负责人的姓名，角色与组织暂缺。
                  </div>
                </div>
              ) : null}
              <StateBlock
                loading={membersLoading}
                error={forbidden ? undefined : directoryError}
                onRetry={() => void usersQuery.refetch()}
                isEmpty={members.length === 0}
                emptyText="还没有团队成员"
              >
                {members.map((member) => (
                  <div className="wb-team-row" key={member.id}>
                    <span className="wb-team-avatar">
                      <Avatar
                        size={32}
                        style={{ background: '#dbe4f5', color: designVars.primary, fontSize: 13 }}
                      >
                        {member.name.slice(0, 1)}
                      </Avatar>
                      <i
                        className={`wb-team-dot${member.accountStatus === 'disabled' ? ' is-off' : ''}${
                          member.accountStatus === null ? ' is-unknown' : ''
                        }`}
                        title={
                          member.accountStatus === 'active'
                            ? '账号状态：启用（接口未提供实时在线状态）'
                            : member.accountStatus === 'disabled'
                              ? '账号状态：停用'
                              : '账号状态未知（降级来源没有账号信息）'
                        }
                        aria-label="账号状态"
                      />
                    </span>
                    <span className="wb-team-name" title={member.name}>
                      {member.name}
                    </span>
                    <span className="wb-team-role">
                      {member.role ? (
                        <ToneTag tone={ROLE_TONE[member.role]}>{ROLE_LABEL[member.role]}</ToneTag>
                      ) : (
                        <span className="wb-muted">—</span>
                      )}
                    </span>
                    <span className="wb-team-org" title={member.org ?? ''}>
                      {member.org ?? '—'}
                    </span>
                  </div>
                ))}
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 角色分工 */}
        <div className="wb-team-4">
          <Panel title="角色分工" flush>
            <div style={{ padding: '4px 18px 16px' }}>
              <StateBlock
                loading={membersLoading}
                error={forbidden ? undefined : directoryError}
                onRetry={() => void usersQuery.refetch()}
                isEmpty={!forbidden && members.length === 0}
                emptyText="还没有团队成员"
              >
                {forbidden ? (
                  <div className="wb-team-notice">
                    <div className="wb-team-notice-title">需要管理员权限查看</div>
                    <div className="wb-team-notice-text">
                      角色分布需要账号目录里的 role 字段，普通账号拿不到，
                      因此这里不展示角色占比。
                    </div>
                  </div>
                ) : (
                  <div className="wb-status-chart">
                    <DonutChart
                      segments={roleSegments}
                      centerValue={members.length}
                      centerLabel="成员数"
                      size={126}
                      thickness={16}
                    />
                    <div className="wb-status-legend">
                      {roleSegments.map((segment) => (
                        <LegendItem
                          key={segment.name}
                          color={segment.color}
                          name={segment.name}
                          value={segment.value}
                          suffix={
                            members.length === 0
                              ? '0%'
                              : `${Math.round((segment.value / members.length) * 100)}%`
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}
              </StateBlock>
            </div>
          </Panel>
        </div>

        {/* 会议纪要 */}
        <div className="wb-team-12">
          <Panel
            title="会议纪要"
            more="全部会议"
            onMore={() => void navigate('/calendar')}
            flush
          >
            <div style={{ padding: '0 18px 16px' }}>
              <StateBlock
                loading={meetingsQuery.isPending}
                error={meetingsQuery.isError ? meetingsQuery.error : undefined}
                onRetry={() => void meetingsQuery.refetch()}
                isEmpty={minutes.length === 0}
                emptyText="还没有会议记录"
                emptyAction={
                  <Button type="primary" onClick={() => void navigate('/calendar')}>
                    去日程安排新建
                  </Button>
                }
              >
                {minutes.map((meeting) => (
                  <div className="wb-team-minute" key={meeting.id}>
                    <span className="wb-team-minute-time">{formatDateTime(meeting.startAt)}</span>
                    <span className="wb-team-minute-body">
                      <span className="wb-team-minute-title" title={meeting.title}>
                        {meeting.title}
                      </span>
                      <span className="wb-team-minute-meta">
                        <span>
                          <EnvironmentOutlined style={{ marginRight: 4 }} />
                          {meeting.location ?? '未设置地点'}
                        </span>
                        <span>
                          <ProjectOutlined style={{ marginRight: 4 }} />
                          {meeting.projectName ?? '未归属项目'}
                        </span>
                      </span>
                      {meeting.note ? (
                        <span className="wb-team-minute-note">{meeting.note}</span>
                      ) : null}
                    </span>
                  </div>
                ))}
              </StateBlock>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
