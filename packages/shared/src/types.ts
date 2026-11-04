/**
 * 共享类型 —— 来源：AI 开发执行包 §6.2「共享类型（最小字段）」。
 * 前后端共用这一份定义；不在前端再写一份。
 *
 * 唯一偏离：OrgNode.level 由 `1 | 2 | 3` 扩为 `1 | 2 | 3 | 4`，
 * 对应决策 D-07（组织层级上限 4 级，人员挂最末级）。
 */

export type Role = 'admin' | 'user';
export type UserStatus = 'active' | 'disabled';
export type TaskStatus = 'todo' | 'doing' | 'done';
export type Priority = 'low' | 'medium' | 'high';
export type ProjectStatus = 'active' | 'done';

export interface OrgNode {
  id: number;
  parentId: number | null;
  /**
   * 层级：根为 1，每级 +1。
   * **不设固定上限**——业务上限由服务端环境变量 MAX_ORG_LEVEL 控制（默认 32），
   * 客户交付后可自行建到任意层级，无需改表或数据迁移。见 decisions.md D-07。
   */
  level: number;
  name: string;
  sort: number;
  userCount: number;
  children: OrgNode[];
}

export interface User {
  id: number;
  account: string;
  name: string;
  role: Role;
  isSuper: boolean;
  orgId: number;
  org: { company: string; dept: string };
  mustChangePassword: boolean;
}

export interface UserListItem extends User {
  status: UserStatus;
  lastLoginAt: string | null;
}

export interface LayoutItem {
  moduleKey: string;
  w: 3 | 4 | 6 | 12;
  h: number;
  config: Record<string, unknown>;
}

export interface Workspace {
  id: number;
  name: string;
  subtitle: string | null;
  version: number;
  items: LayoutItem[];
}

export interface Task {
  id: number;
  userId: number;
  projectId: number | null;
  title: string;
  status: TaskStatus;
  priority: Priority;
  projectName: string | null;
  dueDate: string | null;
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** 负责人（用户端任务清单列） */
  assigneeId: number | null;
  assigneeName: string | null;
  /** 分类（产品需求/会议/开发…） */
  category: string | null;
  /** 提醒时间 */
  reminderAt: string | null;
  /** 父任务 id（子任务计数用） */
  parentId: number | null;
  /** 子任务数 */
  subtaskCount: number;
}

export interface Project {
  id: number;
  userId: number;
  name: string;
  owner: string | null;
  dueDate: string | null;
  totalItems: number;
  doneItems: number;
  progress: number;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  /** 图标标识（模块卡片配色用） */
  icon: string | null;
  /** 主题色 */
  color: string | null;
  /** 当前阶段 */
  phase: string | null;
  /** 成员姓名 */
  members: string[];
  memberCount: number;
}

export interface ProjectDetail {
  project: Project;
  tasks: Task[];
}

export interface Idea {
  id: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface Overview {
  todayTotal: number;
  todayDone: number;
  doingTotal: number;
  doingToday: number;
  weeklyDone: number;
  weeklyTotal: number;
  weeklyRate: number | null;
  projectCount: number;
}

export interface TaskStats {
  todo: number;
  doing: number;
  done: number;
}

export interface ImportResult {
  success: number;
  skipped: number;
  failed: number;
  errors: { row: number; message: string }[];
  initialPasswords: { account: string; password: string }[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 字段规则（执行包 §6.2 末尾） */
export type FieldRuleNote = {
  /** User.org.company 是 level 2 名称，dept 是用户所挂最末级节点名称；/auth/me 必须返回 */
  orgCompanyIsLevel2: true;
  /** Project.progress = Math.round(doneItems / totalItems * 100)；totalItems=0 时 0 */
  progressIsRoundedPercent: true;
  /** Workspace.items 的顺序就是 sort；不在 JSON 里重复 sort */
  layoutOrderIsSort: true;
  /** Task.doneAt 与 status 必须一致；done 必有，非 done 必空 */
  doneAtFollowsStatus: true;
};

/** 用户端「数据统计」页的聚合类型（2026-11-04 批次 2） */

export interface TrendPoint {
  date: string;
  label: string;
  total: number;
  done: number;
  pending: number;
}

export interface TrendResult {
  days: TrendPoint[];
}

export interface ProgressBucket {
  label: string;
  count: number;
}

export interface CategoryStat {
  name: string;
  count: number;
  done: number;
}

export interface TeamMemberWorkload {
  userId: number;
  name: string;
  taskCount: number;
  doneCount: number;
  rate: number;
}

export interface DistributionResult {
  buckets: ProgressBucket[];
  categories: CategoryStat[];
}

export interface TeamWorkloadResult {
  members: TeamMemberWorkload[];
}
