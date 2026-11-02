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
  level: 1 | 2 | 3 | 4;
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
