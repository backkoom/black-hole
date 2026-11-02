/**
 * 模块定义 —— 来源：AI 开发执行包 §7.1 / §7.2 / §7.3 / §7.4 / §7.5。
 * 前端和后端共用这一份定义；不要在前端再写一份中文名/尺寸表。
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// §7.2 ModuleDef
// ---------------------------------------------------------------------------

export type ModuleCategory =
  | '任务与日程'
  | '快捷入口'
  | '项目与数据'
  | '知识与资料'
  | '个性模块';

export interface ModuleDef {
  key: string;
  name: string;
  category: ModuleCategory;
  type: 'basic' | 'content';
  dataSource: string | null;
  defaultSize: { w: 3 | 4 | 6 | 12; h: number };
  minSize: { w: 3 | 4 | 6 | 12; h: number };
  emptyState: string;
  refreshPolicy: 'immediate' | 'onFocus' | 'manual';
  status: 'active' | 'placeholder';
}

export const MODULE_CATEGORIES: ModuleCategory[] = [
  '任务与日程',
  '快捷入口',
  '项目与数据',
  '知识与资料',
  '个性模块',
];

// ---------------------------------------------------------------------------
// §7.1 15 个模块（固定）
// ---------------------------------------------------------------------------

export const MODULES: ModuleDef[] = [
  {
    key: 'todo',
    name: '今日待办',
    category: '任务与日程',
    type: 'basic',
    dataSource: 'tasks.today',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 3, h: 3 },
    emptyState: '今天没有待办',
    refreshPolicy: 'onFocus',
    status: 'active',
  },
  {
    key: 'project-progress',
    name: '项目进度',
    category: '项目与数据',
    type: 'basic',
    dataSource: 'projects.progress',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    emptyState: '还没有进行中的项目',
    refreshPolicy: 'onFocus',
    status: 'active',
  },
  {
    key: 'quick-entry',
    name: '快速入口',
    category: '快捷入口',
    type: 'content',
    dataSource: null,
    defaultSize: { w: 3, h: 4 },
    minSize: { w: 3, h: 3 },
    emptyState: '还没有快捷入口',
    refreshPolicy: 'manual',
    status: 'active',
  },
  {
    key: 'calendar',
    name: '日历',
    category: '任务与日程',
    type: 'basic',
    dataSource: 'tasks.calendar',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 4 },
    emptyState: '本周没有任务',
    refreshPolicy: 'onFocus',
    status: 'active',
  },
  {
    key: 'data-chart',
    name: '数据报表',
    category: '项目与数据',
    type: 'basic',
    dataSource: 'stats.tasks',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 4 },
    emptyState: '还没有任务数据',
    refreshPolicy: 'onFocus',
    status: 'active',
  },
  {
    key: 'idea',
    name: '灵感记录',
    category: '个性模块',
    type: 'basic',
    dataSource: 'ideas.list',
    defaultSize: { w: 3, h: 4 },
    minSize: { w: 3, h: 3 },
    emptyState: '还没有灵感',
    refreshPolicy: 'onFocus',
    status: 'active',
  },
  {
    key: 'text',
    name: '文本卡片',
    category: '知识与资料',
    type: 'content',
    dataSource: null,
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 2 },
    emptyState: '点击编辑文本',
    refreshPolicy: 'manual',
    status: 'active',
  },
  {
    key: 'notice',
    name: '公告通知',
    category: '个性模块',
    type: 'content',
    dataSource: null,
    defaultSize: { w: 4, h: 3 },
    minSize: { w: 3, h: 2 },
    emptyState: '暂无公告',
    refreshPolicy: 'manual',
    status: 'active',
  },
  {
    key: 'links',
    name: '链接列表',
    category: '快捷入口',
    type: 'content',
    dataSource: null,
    defaultSize: { w: 3, h: 3 },
    minSize: { w: 3, h: 2 },
    emptyState: '还没有链接',
    refreshPolicy: 'manual',
    status: 'active',
  },
  {
    key: 'embed',
    name: '嵌入内容',
    category: '个性模块',
    type: 'content',
    dataSource: null,
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    emptyState: '配置嵌入地址',
    refreshPolicy: 'manual',
    status: 'active',
  },
  {
    key: 'gallery',
    name: '图片墙',
    category: '个性模块',
    type: 'content',
    dataSource: null,
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    emptyState: '还没有图片',
    refreshPolicy: 'manual',
    status: 'active',
  },
  {
    key: 'divider',
    name: '分割线',
    category: '个性模块',
    type: 'content',
    dataSource: null,
    defaultSize: { w: 12, h: 2 },
    minSize: { w: 12, h: 2 },
    emptyState: '—',
    refreshPolicy: 'manual',
    status: 'active',
  },
  {
    key: 'file',
    name: '文件资料',
    category: '知识与资料',
    type: 'basic',
    dataSource: 'attachment',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    emptyState: '功能迭代中',
    refreshPolicy: 'manual',
    status: 'placeholder',
  },
  {
    key: 'knowledge-list',
    name: '内容列表',
    category: '知识与资料',
    type: 'basic',
    dataSource: 'documents',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    emptyState: '功能迭代中',
    refreshPolicy: 'manual',
    status: 'placeholder',
  },
  {
    key: 'ai',
    name: 'AI 助手',
    category: '个性模块',
    type: 'basic',
    dataSource: 'prompt',
    defaultSize: { w: 6, h: 4 },
    minSize: { w: 4, h: 3 },
    emptyState: '功能迭代中',
    refreshPolicy: 'manual',
    status: 'placeholder',
  },
];

export const MODULE_BY_KEY: Record<string, ModuleDef> = Object.fromEntries(
  MODULES.map((m) => [m.key, m]),
);

/** 12 个 active 模块：唯一可以写进 workspace_layout 的 module_key */
export const ACTIVE_MODULE_KEYS = MODULES.filter((m) => m.status === 'active').map((m) => m.key);

/** 3 个 placeholder：只在模块库展示，不可拖入 */
export const PLACEHOLDER_MODULE_KEYS = MODULES.filter((m) => m.status === 'placeholder').map(
  (m) => m.key,
);

// ---------------------------------------------------------------------------
// §7.4 默认 config
// ---------------------------------------------------------------------------

export const DEFAULT_MODULE_CONFIGS: Record<string, unknown> = {
  'quick-entry': {
    items: [
      { label: '项目', url: '/projects' },
      { label: '任务', url: '/tasks' },
      { label: '灵感', url: '/workspace' },
      { label: '设置', url: '/settings/profile' },
    ],
  },
  text: { title: '', body: '' },
  notice: { title: '', body: '', level: 'info' },
  links: { items: [] },
  embed: { url: '', height: 400 },
  gallery: { images: [] },
  divider: { label: '' },
};

/** 模板默认 4 条布局（v2 §4.9 / 执行包 §5.1 第 4 条） */
export const DEFAULT_TEMPLATE_ITEMS: ReadonlyArray<{
  moduleKey: string;
  w: 3 | 4 | 6 | 12;
  h: number;
}> = [
  { moduleKey: 'todo', w: 6, h: 4 },
  { moduleKey: 'project-progress', w: 6, h: 4 },
  { moduleKey: 'quick-entry', w: 3, h: 4 },
  { moduleKey: 'idea', w: 3, h: 4 },
];

// ---------------------------------------------------------------------------
// §7.3 config schema（zod）
// ---------------------------------------------------------------------------

const isHttp = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

const isHttps = (v: string) => {
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * 判断是否含控制字符（U+0000–U+001F）。
 * 等价于原文的 /[\u0000-\u001f]/ 匹配，但不用正则——否则会被 ESLint 的
 * no-control-regex 规则拦下。逐字符判断，行为一致。
 */
const hasControlChar = (v: string) => {
  for (let i = 0; i < v.length; i += 1) {
    if (v.charCodeAt(i) <= 0x1f) return true;
  }
  return false;
};

const isAppPath = (v: string) => {
  if (typeof v !== 'string' || !v.startsWith('/') || v.startsWith('//')) return false;
  if (v.includes('\\') || hasControlChar(v)) return false;
  try {
    const u = new URL(v, 'https://app.invalid');
    return u.origin === 'https://app.invalid' && u.pathname.startsWith('/');
  } catch {
    return false;
  }
};

const httpUrl = z.string().max(2048).refine(isHttp, '只允许 http/https 地址');
const quickUrl = z
  .string()
  .max(2048)
  .refine((v) => isHttp(v) || isAppPath(v), '只允许 http/https 或站内绝对路径');
const httpsUrl = z.string().max(2048).refine(isHttps, '只允许 https 地址');

export const quickEntrySchema = z.object({
  items: z
    .array(
      z.object({
        label: z.string().min(1),
        url: quickUrl,
      }),
    )
    .max(8),
});

export const textSchema = z.object({
  title: z.string(),
  body: z.string().max(2000),
});

export const noticeSchema = z.object({
  title: z.string(),
  body: z.string().max(500),
  level: z.enum(['info', 'warning']),
});

export const linksSchema = z.object({
  items: z
    .array(
      z.object({
        label: z.string().min(1),
        url: httpUrl,
      }),
    )
    .max(8),
});

export const embedSchema = z.object({
  url: z.string().max(2048).refine((v) => v === '' || isHttps(v), '只允许 https 地址'),
  height: z.number().int().positive().max(2000).optional(),
});

export const gallerySchema = z.object({
  images: z
    .array(
      z.object({
        url: httpsUrl,
        caption: z.string().optional(),
      }),
    )
    .max(9),
});

export const dividerSchema = z.object({
  label: z.string().max(20).optional(),
});

export const moduleConfigSchemas = {
  'quick-entry': quickEntrySchema,
  text: textSchema,
  notice: noticeSchema,
  links: linksSchema,
  embed: embedSchema,
  gallery: gallerySchema,
  divider: dividerSchema,
} as const;

// basic 模块没有内容 config；不能落到“未知模块”分支，否则合法布局会被拒绝。
const basicModuleKeys = new Set(['todo', 'project-progress', 'calendar', 'data-chart', 'idea']);

// 只有 12 个 active 模块能进 layout 或模板；placeholder 和未知 key 都必须在这里被拒绝，
// 不能落进 content schema 的“未知模块”分支。调用方把该 Error 映射为 422，不能落 500。
const activeModuleKeys = new Set(ACTIVE_MODULE_KEYS);

export function validateModuleConfig(moduleKey: string, config: unknown) {
  if (!activeModuleKeys.has(moduleKey)) {
    throw new Error('模块不可用：' + moduleKey);
  }
  if (basicModuleKeys.has(moduleKey)) {
    const parsed = z.object({}).parse(config ?? {});
    const size = new TextEncoder().encode(JSON.stringify(parsed)).length;
    if (size > 64 * 1024) throw new Error('config 不能超过 64KB');
    return parsed;
  }
  const schema = moduleConfigSchemas[moduleKey as keyof typeof moduleConfigSchemas];
  if (!schema) throw new Error('未知模块：' + moduleKey);
  const parsed = schema.parse(config ?? {});
  const size = new TextEncoder().encode(JSON.stringify(parsed)).length;
  if (size > 64 * 1024) throw new Error('config 不能超过 64KB');
  return parsed;
}

// ---------------------------------------------------------------------------
// 布局约束（执行包 §3.5 / §6.5 / v2 §9.10）—— 供 API 与前端共用
// ---------------------------------------------------------------------------

export const LAYOUT_RULES = {
  /** 总模块数上限（应用层） */
  maxModules: 14,
  /** 分割线最多 3 条 */
  maxDividers: 3,
  /** 宽度只能停在四档 */
  allowedWidths: [3, 4, 6, 12] as const,
  /** 高度整数行范围 */
  minHeight: 2,
  maxHeight: 12,
  /** config 体积上限 */
  maxConfigBytes: 64 * 1024,
  /** divider 固定尺寸 */
  dividerSize: { w: 12, h: 2 } as const,
} as const;
