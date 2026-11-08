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
  /** 日程开始时间（有则画时间段） */
  startAt: string | null;
}

export interface Project {
  id: number;
  userId: number;
  name: string;
  owner: string | null;
  /** 项目开始日（甘特条左端）；历史数据等于创建日 */
  startDate: string | null;
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

/** 里程碑与会议（用户端「日程安排」「进度追踪」页） */

export interface Milestone {
  id: number;
  projectId: number | null;
  projectName: string | null;
  name: string;
  dueDate: string | null;
  status: 'pending' | 'done';
  sort: number;
  createdAt: string;
  updatedAt: string;
}

export interface Meeting {
  id: number;
  projectId: number | null;
  projectName: string | null;
  title: string;
  location: string | null;
  startAt: string;
  endAt: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 风险与问题（用户端「风险问题管理」页） */

export type RiskLevel = 'low' | 'medium' | 'high';
export type RiskStatus = 'open' | 'handling' | 'resolved';

export interface Risk {
  id: number;
  projectId: number | null;
  projectName: string | null;
  code: string | null;
  kind: 'risk' | 'issue';
  title: string;
  description: string | null;
  level: RiskLevel;
  impact: RiskLevel | null;
  probability: RiskLevel | null;
  status: RiskStatus;
  ownerId: number | null;
  ownerName: string | null;
  dueDate: string | null;
  responsePlan: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RiskStats {
  total: number;
  byLevel: Record<RiskLevel, { count: number; percent: number }>;
  byStatus: Record<RiskStatus, number>;
  byKind: { risk: number; issue: number };
  /** 键是 `impact:probability`，值是数量 */
  matrix: Record<string, number>;
}

/** 文件资料（用户端「文件资料」页）—— 本期只存元数据，不存二进制 */

export type FileKind = 'doc' | 'sheet' | 'slide' | 'image' | 'pdf' | 'archive' | 'other';

export interface FileAsset {
  id: number;
  projectId: number | null;
  projectName: string | null;
  folderId: number | null;
  folderName: string | null;
  name: string;
  kind: FileKind;
  sizeBytes: number;
  version: string;
  /** 当前版本号（从 1 开始，与 file_version.version_no 对应） */
  versionNo: number;
  currentVersion: boolean;
  /** 是否有可下载的实体（历史登记数据只有元数据 → false） */
  hasFile: boolean;
  /** 上传时记录的类型，下载时原样回给浏览器 */
  mimeType: string | null;
  ownerName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 项目成员（D-30）：isOwner 为归属人，其余为协作者 */
export interface ProjectMemberInfo {
  userId: number;
  name: string;
  account: string;
  isOwner: boolean;
}

/** 站内通知（D-28）：一人一条，readAt 为空表示未读 */
export type NotificationKind = 'task_due' | 'task_overdue' | 'system';

export interface Notification {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string | null;
  /** 点击后跳转的前端路由；为空表示纯文本提醒 */
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/** 文件历史版本（D-27）：一行一份磁盘实体，不会互相覆盖 */
export interface FileVersion {
  versionNo: number;
  sizeBytes: number;
  mimeType: string | null;
  sha256: string | null;
  /** 上传时填的备注；回滚产生的版本会写「回滚自 vN」 */
  note: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

export interface FileFolder {
  id: number;
  projectId: number | null;
  parentId: number | null;
  name: string;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FileStats {
  totalCount: number;
  totalBytes: number;
  folderCount: number;
  byKind: Array<{ kind: FileKind; count: number; bytes: number }>;
}

/* ── 团队协作补全（2026-11-05）：公告 / 讨论 / 审批 ───────────────── */

export interface Announcement {
  id: number;
  userId: number;
  userName: string;
  projectId: number | null;
  projectName: string | null;
  title: string;
  content: string;
  /** 置顶 */
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export type DiscussionTargetType = 'task' | 'project';

export interface Discussion {
  id: number;
  userId: number;
  userName: string;
  targetType: DiscussionTargetType;
  targetId: number;
  /** 回复的父讨论；null 表示顶层 */
  parentId: number | null;
  content: string;
  createdAt: string;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface Approval {
  id: number;
  requesterId: number;
  requesterName: string;
  /** 审批人；null 表示还没指派 */
  assigneeId: number | null;
  assigneeName: string | null;
  /** 审批类型，如 项目立项 / 预算 / 变更 */
  kind: string;
  title: string;
  detail: string | null;
  targetType: DiscussionTargetType | null;
  targetId: number | null;
  status: ApprovalStatus;
  /** 审批意见 */
  comment: string | null;
  decidedAt: string | null;
  createdAt: string;
}
