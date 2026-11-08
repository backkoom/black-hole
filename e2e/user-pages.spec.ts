import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { clearMustChange, resetAdmin } from './helpers.js';

/**
 * 用户端模块 E2E 冒烟 —— 覆盖「工作台 / 工作看板 / 任务 / 周进度 / 问题风险 /
 * 团队协作 / 日程安排 / 文件资料 / 个人资料」。
 * 注：D-24 起「数据统计」并入工作台，独立入口取消（老链接 /analytics 重定向回工作台）。
 *
 * 约定（与 e2e/workspace.spec.ts、e2e/auth.spec.ts 一致）：
 *  - 数据**全部走真实接口**造（beforeAll 里 POST，afterAll 里 DELETE），**不 mock**；
 *  - 造数统一用 `e2e-user-` 前缀，清理时按记录的 id + 前缀扫描双重兜底；
 *  - 口令从 `process.env.SEED_ADMIN_PASSWORD` 读（由 playwright.config.ts 注入），
 *    **绝不写进代码**；
 *  - 种子 admin 的 must_change_password 默认为 true → 登录前先 clearMustChange()，
 *    跑完用 resetAdmin() 恢复种子状态（口令 + 必须改密标记 + 清会话）。
 *
 * 断言口径：**页面上的数字必须等于接口返回的数字**，不接受「页面没白屏」这种弱断言。
 */

/** 造数前缀 —— 与其它 spec 的数据隔离，避免互相干扰 */
const PREFIX = 'e2e-user-';

/**
 * 已知第三方噪音 —— 不是被测页面的缺陷，不计入失败。
 * antd 5.29+ 对 ConfigProvider 的 `autoInsertSpaceInButton` 属性打弃用警告，
 * 而 apps/web/src/main.tsx 仍在用旧写法（该文件不在本次改动范围内）。
 * 除这一条以外，任何 console.error 仍然算失败。
 */
const KNOWN_CONSOLE_NOISE = [/\[antd: ConfigProvider\].*autoInsertSpaceInButton.*deprecated/];

/**
 * 显式豁免两处**预期行为**的接口错误：
 *  1. GET /api/auth/me 返回 401 —— 未登录时前端首屏探测登录态，正常分支；
 *  2. GET /api/users 返回 403 —— 普通账号访问管理员接口，权限拦截生效，不是故障。
 */
function isExpectedApiError(status: number, pathname: string): boolean {
  if (status === 401 && pathname === '/api/auth/me') return true;
  if (status === 403 && pathname.startsWith('/api/users')) return true;
  return false;
}

/** 接口响应体统一包装 */
interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

interface TaskDto {
  id: number;
  status: 'todo' | 'doing' | 'done';
  title: string;
  dueDate: string | null;
  projectId: number | null;
  category: string | null;
}

interface ProjectDto {
  id: number;
  name: string;
  status: 'active' | 'done';
  progress: number;
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 造出来待清理的资源 id */
const created = {
  tasks: [] as number[],
  projects: [] as number[],
  risks: [] as number[],
  files: [] as number[],
  folders: [] as number[],
  milestones: [] as number[],
  meetings: [] as number[],
};

/** Asia/Shanghai 的日历日（与前端 utils/datetime.ts、服务端 lib/serialize.ts 同口径） */
function shanghaiDate(offsetDays = 0): string {
  const shifted = new Date(Date.now() + 8 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return shifted.toISOString().slice(0, 10);
}

/** Asia/Shanghai 的 ISO 时间戳 */
function shanghaiIso(hour: number, minute = 0): string {
  const shifted = new Date(Date.now() + 8 * 3600 * 1000);
  const day = shifted.toISOString().slice(0, 10);
  return `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+08:00`;
}

async function apiGet<T>(request: APIRequestContext, path: string): Promise<T> {
  const res = await request.get(path);
  if (!res.ok()) throw new Error(`GET ${path} → ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as Envelope<T>;
  return body.data;
}

async function apiPost<T>(request: APIRequestContext, path: string, data: unknown): Promise<T> {
  const res = await request.post(path, { data });
  if (!res.ok()) throw new Error(`POST ${path} → ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as Envelope<T>;
  return body.data;
}

async function apiPatch<T>(request: APIRequestContext, path: string, data: unknown): Promise<T> {
  const res = await request.patch(path, { data });
  if (!res.ok()) throw new Error(`PATCH ${path} → ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as Envelope<T>;
  return body.data;
}

/** 删除资源；404 视为「已经删掉了」，不报错（清理要幂等） */
async function apiDelete(request: APIRequestContext, path: string): Promise<void> {
  const res = await request.delete(path);
  if (res.ok() || res.status() === 404) return;
  throw new Error(`DELETE ${path} → ${res.status()} ${await res.text()}`);
}

/** 取全部任务（服务端分页，翻满） */
async function fetchAllTasks(request: APIRequestContext): Promise<TaskDto[]> {
  const first = await apiGet<Paged<TaskDto>>(request, '/api/tasks?page=1&pageSize=100');
  const items = [...first.items];
  const pages = Math.ceil(first.total / 100);
  for (let page = 2; page <= pages; page += 1) {
    const next = await apiGet<Paged<TaskDto>>(request, `/api/tasks?page=${page}&pageSize=100`);
    items.push(...next.items);
  }
  return items;
}

/**
 * 指标卡的数字 —— 按 label 定位卡片，取卡片里的大号数字。
 * 卡片结构（apps/web/src/components/ui/index.tsx 的 MetricCard）：
 *   div[卡片] > div[表头: 图标+label] / div[数值行: div[数值]+Sparkline] / div[脚注]
 */
async function metricValue(page: Page, label: string): Promise<string> {
  const card = page
    .locator('.wb-metric-row > div, .wb-metric-grid > div')
    .filter({ has: page.locator(`span:text-is("${label}")`) });
  await expect(card, `指标卡「${label}」应唯一存在`).toHaveCount(1);
  return (await card.locator('div').nth(2).innerText()).trim();
}

/** 面板标题存在（Panel 渲染成 h3） */
async function expectPanel(page: Page, title: string): Promise<void> {
  await expect(
    page.getByRole('heading', { level: 3, name: title, exact: true }),
    `面板「${title}」应存在`,
  ).toBeVisible();
}

/** 面板内包含某段文本 */
async function expectPanelContains(page: Page, title: string, text: string): Promise<void> {
  const panel = page.locator('section').filter({
    has: page.getByRole('heading', { level: 3, name: title, exact: true }),
  });
  await expect(panel, `面板「${title}」应唯一存在`).toHaveCount(1);
  await expect(panel.getByText(text, { exact: false }).first()).toBeVisible();
}

/** 任务列表卡片标题（antd Card 的 title 不是 heading，用类名定位） */
function taskListTitle(page: Page, total: number): ReturnType<Page['locator']> {
  return page.locator('.ant-card-head-title', { hasText: `任务列表（共 ${total} 项）` });
}

test.describe('用户端 10 页', () => {
  /** beforeAll 专用 API 客户端（request fixture 不能跨 beforeAll → test 复用） */
  let api: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    // 种子 admin 默认「必须改密」→ 先清掉标记，否则除改密外的接口全被 403 拦
    await clearMustChange();

    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password) throw new Error('SEED_ADMIN_PASSWORD 未设置（应由 playwright.config.ts 注入）');

    api = await playwright.request.newContext({ baseURL: 'http://localhost:5173' });
    const login = await api.post('/api/auth/login', { data: { account: 'admin', password } });
    if (!login.ok()) throw new Error(`admin 登录失败 → ${login.status()} ${await login.text()}`);

    // ---- 项目 ----
    const project = await apiPost<{ project: ProjectDto }>(api, '/api/projects', {
      name: `${PREFIX}冒烟项目`,
      owner: `${PREFIX}负责人`,
      dueDate: shanghaiDate(30),
      phase: `${PREFIX}阶段甲`,
    });
    created.projects.push(project.project.id);
    const projectId = project.project.id;

    // ---- 任务（4 条，覆盖看板 4 列与今日/逾期口径）----
    const todoToday = await apiPost<{ task: TaskDto }>(api, '/api/tasks', {
      title: `${PREFIX}任务-待办今天`,
      projectId,
      priority: 'high',
      category: '需求',
      dueDate: shanghaiDate(),
      reminderAt: shanghaiIso(9),
    });
    created.tasks.push(todoToday.task.id);

    const overdue = await apiPost<{ task: TaskDto }>(api, '/api/tasks', {
      title: `${PREFIX}任务-逾期`,
      projectId,
      priority: 'medium',
      dueDate: shanghaiDate(-1),
    });
    created.tasks.push(overdue.task.id);

    const doing = await apiPost<{ task: TaskDto }>(api, '/api/tasks', {
      title: `${PREFIX}任务-进行中`,
      projectId,
      dueDate: shanghaiDate(3),
    });
    await apiPatch(api, `/api/tasks/${doing.task.id}/status`, { status: 'doing' });
    created.tasks.push(doing.task.id);

    const done = await apiPost<{ task: TaskDto }>(api, '/api/tasks', {
      title: `${PREFIX}任务-已完成`,
      projectId,
      dueDate: shanghaiDate(1),
    });
    await apiPatch(api, `/api/tasks/${done.task.id}/status`, { status: 'done' });
    created.tasks.push(done.task.id);

    // ---- 风险 ----
    const risk = await apiPost<{ risk: { id: number } }>(api, '/api/risks', {
      title: `${PREFIX}风险-高危`,
      kind: 'risk',
      code: `${PREFIX}R-01`,
      projectId,
      description: `${PREFIX}冒烟用风险`,
      level: 'high',
      impact: 'high',
      probability: 'medium',
      dueDate: shanghaiDate(5),
      responsePlan: `${PREFIX}应对措施`,
    });
    created.risks.push(risk.risk.id);

    // ---- 文件与文件夹 ----
    const folder = await apiPost<{ folder: { id: number } }>(api, '/api/folders', {
      name: `${PREFIX}文件夹-资料`,
      projectId,
    });
    created.folders.push(folder.folder.id);

    const file = await apiPost<{ file: { id: number } }>(api, '/api/files', {
      name: `${PREFIX}文件-方案.pdf`,
      kind: 'pdf',
      sizeBytes: 2048,
      projectId,
      folderId: folder.folder.id,
      version: 'v1.0',
    });
    created.files.push(file.file.id);

    // ---- 会议与里程碑 ----
    const meeting = await apiPost<{ meeting: { id: number } }>(api, '/api/meetings', {
      title: `${PREFIX}会议-周会`,
      startAt: shanghaiIso(10),
      endAt: shanghaiIso(11),
      location: `${PREFIX}会议室`,
      projectId,
      note: `${PREFIX}会议纪要`,
    });
    created.meetings.push(meeting.meeting.id);

    const milestone = await apiPost<{ milestone: { id: number } }>(api, '/api/milestones', {
      name: `${PREFIX}里程碑-上线`,
      projectId,
      dueDate: shanghaiDate(7),
    });
    created.milestones.push(milestone.milestone.id);
  });

  test.afterAll(async () => {
    if (api) {
      // 顺序：先子资源后项目（删项目会把任务 project_id 置空）
      for (const id of created.tasks) await apiDelete(api, `/api/tasks/${id}`);
      for (const id of created.risks) await apiDelete(api, `/api/risks/${id}`);
      for (const id of created.files) await apiDelete(api, `/api/files/${id}`);
      for (const id of created.folders) await apiDelete(api, `/api/folders/${id}`);
      for (const id of created.meetings) await apiDelete(api, `/api/meetings/${id}`);
      for (const id of created.milestones) await apiDelete(api, `/api/milestones/${id}`);
      for (const id of created.projects) await apiDelete(api, `/api/projects/${id}`);

      // 兜底：把带前缀的残留（页面里快速添加的任务等）一并清掉
      const leftovers = await apiGet<Paged<TaskDto>>(api, '/api/tasks?page=1&pageSize=100');
      for (const task of leftovers.items) {
        if (task.title.startsWith(PREFIX)) await apiDelete(api, `/api/tasks/${task.id}`);
      }
      await api.dispose();
    }
    // 恢复种子状态：admin 口令回到种子值、must_change_password 回到 true、清空会话
    await resetAdmin();
  });

  /** 每个测试用例的错误收集器 */
  let consoleErrors: string[] = [];
  let pageErrors: string[] = [];
  let badApiResponses: string[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    pageErrors = [];
    badApiResponses = [];

    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (KNOWN_CONSOLE_NOISE.some((pattern) => pattern.test(text))) return;
      consoleErrors.push(text);
    });
    page.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });
    page.on('response', (response) => {
      const pathname = new URL(response.url()).pathname;
      if (!pathname.startsWith('/api/')) return;
      if (response.status() < 400) return;
      if (isExpectedApiError(response.status(), pathname)) return;
      badApiResponses.push(`${response.status()} ${pathname}`);
    });

    // 登录 —— page.request 与浏览器上下文共享 Cookie，登录后页面即已登录态
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password) throw new Error('SEED_ADMIN_PASSWORD 未设置（应由 playwright.config.ts 注入）');
    const login = await page.request.post('/api/auth/login', {
      data: { account: 'admin', password },
    });
    expect(login.ok(), `admin 登录失败 → ${login.status()}`).toBeTruthy();
  });

  test.afterEach(async () => {
    expect(consoleErrors, '页面不应出现 console.error').toEqual([]);
    expect(pageErrors, '不应出现未捕获的页面异常').toEqual([]);
    expect(badApiResponses, '不应出现 4xx/5xx 的接口响应').toEqual([]);
  });

  test('工作台：六张时间卡与接口一致，点数字能下钻', async ({ page }) => {
    const projects = await apiGet<Paged<ProjectDto>>(api, '/api/projects?page=1&pageSize=100');
    const activeCount = projects.items.filter((project) => project.status === 'active').length;
    const todayTasks = await apiGet<Paged<unknown>>(api, '/api/tasks?due=today&page=1&pageSize=1');

    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1, name: '工作台' })).toBeVisible();

    // 六张时间卡（D-24）：名字齐全
    for (const name of ['我的工作', '今日任务', '周工作', '月度工作', '季度工作', '年度工作']) {
      await expect(page.locator('.wb-metric-row > *', { hasText: name }).first()).toBeVisible();
    }
    // 数字 === 接口口径
    expect(await metricValue(page, '我的工作')).toBe(String(activeCount));
    expect(await metricValue(page, '今日任务')).toBe(String(todayTasks.total));

    // 面板齐全，且确实渲染了造出来的数据
    for (const title of ['任务状态', '年度工作规划', '随记', '团队成员']) {
      await expectPanel(page, title);
    }
    await expectPanelContains(page, '年度工作规划', `${PREFIX}冒烟项目`);

    // 下钻：点「今日任务」应带 due=today 进任务列表
    await page.locator('.wb-metric-row > *', { hasText: '今日任务' }).first().click();
    await expect(page).toHaveURL(/view=tasks/);
    await expect(page).toHaveURL(/due=today/);
  });

  test('看板：4 列计数与接口一致', async ({ page }) => {
    const tasks = await fetchAllTasks(api);
    const today = shanghaiDate();
    const expected = {
      待开始: tasks.filter((t) => t.status === 'todo').length,
      进行中: tasks.filter((t) => t.status === 'doing').length,
      已完成: tasks.filter((t) => t.status === 'done').length,
      已逾期: tasks.filter(
        (t) => t.status !== 'done' && t.dueDate !== null && t.dueDate < today,
      ).length,
    };

    await page.goto('/kanban', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1, name: '工作看板' })).toBeVisible();

    for (const [title, count] of Object.entries(expected)) {
      const column = page.locator('section.wb-kanban-col').filter({
        has: page.locator('.wb-kanban-col-title', { hasText: title }),
      });
      await expect(column, `看板列「${title}」应存在`).toHaveCount(1);
      await expect(column, `看板列「${title}」计数应等于接口口径`).toHaveAttribute(
        'aria-label',
        `${title}（${count}）`,
      );
    }
    // 看板指标卡同样来自 /api/stats/tasks
    const statsTasks = await apiGet<{ todo: number; doing: number; done: number }>(
      api,
      '/api/stats/tasks',
    );
    expect(await metricValue(page, '全部任务')).toBe(
      String(statsTasks.todo + statsTasks.doing + statsTasks.done),
    );
    expect(await metricValue(page, '待处理')).toBe(String(statsTasks.todo));
  });

  test('看板：快速新建任务后「待开始」列 +1', async ({ page }) => {
    await page.goto('/kanban', { waitUntil: 'networkidle' });

    const column = page.locator('section.wb-kanban-col').filter({
      has: page.locator('.wb-kanban-col-title', { hasText: '待开始' }),
    });
    await expect(column).toHaveCount(1);
    const before = Number((await column.getAttribute('aria-label'))?.match(/（(\d+)）/)?.[1]);
    expect(Number.isFinite(before)).toBeTruthy();

    const title = `${PREFIX}临时任务-${Date.now()}`;
    await column.locator('.wb-kanban-add').click();
    await column.getByPlaceholder('输入任务标题后回车').fill(title);
    await column.getByRole('button', { name: '添加' }).click();

    await expect(column).toHaveAttribute('aria-label', `待开始（${before + 1}）`);
    await expect(column.locator('.wb-kanban-card-title', { hasText: title })).toBeVisible();

    // 页面造出来的任务也要进清理名单（按标题反查 id）
    const found = await apiGet<Paged<TaskDto>>(
      api,
      `/api/tasks?page=1&pageSize=100&keyword=${encodeURIComponent(title)}`,
    );
    expect(found.items).toHaveLength(1);
    created.tasks.push(found.items[0].id);
  });

  test('任务清单：表格行数与接口 total 一致', async ({ page }) => {
    const total = await apiGet<Paged<TaskDto>>(api, '/api/tasks?page=1&pageSize=1');
    expect(total.total).toBeGreaterThan(0);
    expect(total.total, '表格每页最多 50 行，本用例前提是任务数 ≤ 50').toBeLessThanOrEqual(50);

    await page.goto('/tasks', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1, name: '任务清单' })).toBeVisible();

    // 卡片标题里的「共 N 项」=== 接口 total
    await expect(taskListTitle(page, total.total)).toBeVisible();

    // 每页切到 50 行 → 表格行数 === 接口 total
    await page.locator('.ant-select-selection-item', { hasText: '每页 10 条' }).click();
    await page
      .locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: '每页 50 条' })
      .click();
    await expect(page.locator('.wb-table tbody tr.ant-table-row')).toHaveCount(total.total);
  });

  test('任务清单：筛选项存在且可用', async ({ page }) => {
    await page.goto('/tasks', { waitUntil: 'networkidle' });

    // 5 个筛选下拉都在
    for (const placeholder of ['全部项目', '全部状态', '全部优先级', '全部负责人', '全部分类']) {
      await expect(
        page.locator('.ant-select-selection-placeholder', { hasText: placeholder }),
        `筛选项「${placeholder}」应存在`,
      ).toBeVisible();
    }
    await expect(page.getByPlaceholder('搜索任务名称、关键词或编号…')).toBeVisible();
    await expect(page.getByRole('button', { name: '更多筛选' })).toBeVisible();
    await expect(page.getByRole('button', { name: '重置' })).toBeVisible();

    // 用「全部状态」筛选 → 结果与接口 status=done 的口径一致
    const doneTotal = await apiGet<Paged<TaskDto>>(api, '/api/tasks?page=1&pageSize=1&status=done');
    // 点 Select 本体而不是 placeholder 文本 —— placeholder 上有搜索框会拦截点击
    await page
      .locator('.wb-filter-select')
      .filter({ has: page.locator('.ant-select-selection-placeholder', { hasText: '全部状态' }) })
      .click();
    await page
      .locator('.ant-select-dropdown:visible .ant-select-item-option', { hasText: '已完成' })
      .click();
    await expect(taskListTitle(page, doneTotal.total)).toBeVisible();
    await expect(page.locator('.wb-table tbody tr.ant-table-row')).toHaveCount(doneTotal.total);

    // 重置 → 回到全量
    await page.getByRole('button', { name: '重置' }).click();
    const all = await apiGet<Paged<TaskDto>>(api, '/api/tasks?page=1&pageSize=1');
    await expect(taskListTitle(page, all.total)).toBeVisible();

    // 关键字搜索可用
    await page.getByPlaceholder('搜索任务名称、关键词或编号…').fill(`${PREFIX}任务-待办今天`);
    await page.keyboard.press('Enter');
    await expect(taskListTitle(page, 1)).toBeVisible();
    await expect(page.locator('.wb-table tbody tr.ant-table-row')).toHaveCount(1);
  });

  test('日程：月历 42 格，今天有任务的日子有圆点', async ({ page }) => {
    await page.goto('/calendar', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1, name: '日程安排' })).toBeVisible();

    // 月历固定 6 行 × 7 列 = 42 格
    await expect(page.locator('.wb-cal-cell')).toHaveCount(42);
    await expect(page.locator('.wb-cal-weekhead span')).toHaveCount(7);

    // 今天这格有任务 → 有圆点
    const todayCell = page.locator('.wb-cal-cell.is-today');
    await expect(todayCell).toHaveCount(1);
    await expect(todayCell).toHaveAttribute('aria-label', /·\s*\d+\s*项任务/);
    await expect(todayCell.locator('.wb-cal-dot').first()).toBeVisible();

    // 面板标题齐全，造出来的会议与里程碑真的渲染出来了
    for (const title of [
      '日历视图',
      '今日会议',
      '任务提醒',
      '今日时间轴',
      '重要里程碑',
      '近期日程',
    ]) {
      await expectPanel(page, title);
    }
    await expectPanelContains(page, '今日会议', `${PREFIX}会议-周会`);
    await expectPanelContains(page, '任务提醒', `${PREFIX}任务-待办今天`);
    await expectPanelContains(page, '重要里程碑', `${PREFIX}里程碑-上线`);

    // 指标卡：会议数 / 里程碑数 === 接口口径
    const meetings = await apiGet<{ items: unknown[] }>(api, '/api/meetings');
    const milestones = await apiGet<{ items: unknown[] }>(api, '/api/milestones');
    expect(await metricValue(page, '会议安排')).toBe(String(meetings.items.length));
    expect(await metricValue(page, '重要里程碑')).toBe(String(milestones.items.length));
  });

  test('进度：面板标题齐全且项目进度有数据', async ({ page }) => {
    const statsTasks = await apiGet<{ todo: number; doing: number; done: number }>(
      api,
      '/api/stats/tasks',
    );
    const projects = await apiGet<Paged<ProjectDto>>(api, '/api/projects?page=1&pageSize=100');

    await page.goto('/progress', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1, name: '周工作完成进度' })).toBeVisible();

    for (const title of ['项目进度计划', '项目健康度', '阶段进度', '进度偏差分析']) {
      await expectPanel(page, title);
    }

    expect(await metricValue(page, '已完成任务')).toBe(String(statsTasks.done));
    expect(await metricValue(page, '进行中任务')).toBe(String(statsTasks.doing));

    // 「里程碑达成」用的是项目口径：已完成项目数 / 项目总数
    const doneProjects = projects.items.filter((p) => p.status === 'done').length;
    expect(await metricValue(page, '里程碑达成')).toBe(`${doneProjects}/${projects.items.length}`);

    // 数据区非空：项目与阶段都渲染出来了
    await expectPanelContains(page, '项目进度计划', `${PREFIX}冒烟项目`);
    await expectPanelContains(page, '阶段进度', `${PREFIX}阶段甲`);
  });

  test('团队：成员与会议纪要有数据', async ({ page }) => {
    const users = await apiGet<Paged<{ id: number }>>(api, '/api/users?page=1&pageSize=100');

    await page.goto('/team', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1, name: '团队协作' })).toBeVisible();

    for (const title of ['团队成员', '角色分工', '会议纪要']) {
      await expectPanel(page, title);
    }

    // 成员数 === 接口返回的账号数
    expect(await metricValue(page, '团队成员数')).toBe(String(users.items.length));
    await expect(page.locator('.wb-team-row')).toHaveCount(users.items.length);

    // 会议纪要里真的有造出来的会议
    await expectPanelContains(page, '会议纪要', `${PREFIX}会议-周会`);
  });

  test('文件：文件夹、分类与文件列表有数据', async ({ page }) => {
    const stats = await apiGet<{ totalCount: number; folderCount: number }>(
      api,
      '/api/files/summary',
    );

    await page.goto('/files', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1, name: '文件资料' })).toBeVisible();

    for (const title of ['文件夹', '文件分类', '文件列表', '最近上传', '版本历史', '文件权限']) {
      await expectPanel(page, title);
    }

    // 指标卡 === 接口统计
    expect(await metricValue(page, '文件总数')).toBe(String(stats.totalCount));

    // 文件夹与文件真的渲染出来了
    await expectPanelContains(page, '文件夹', `${PREFIX}文件夹-资料`);
    await expectPanelContains(page, '文件列表', `${PREFIX}文件-方案.pdf`);
    await expect(page.locator('.wb-file-category-name', { hasText: 'PDF' })).toBeVisible();
  });

  test('文件：真实上传后进列表，下载内容一致', async ({ page }) => {
    await page.goto('/files', { waitUntil: 'networkidle' });

    const name = `${PREFIX}上传-${Date.now()}.txt`;
    const content = 'E2E 上传内容\n第二行\n';
    // 直接喂给 antd Upload 的隐藏 input，走真实的 multipart 上传
    await page.locator('input[type="file"]').setInputFiles({
      name,
      mimeType: 'text/plain',
      buffer: Buffer.from(content, 'utf8'),
    });

    // 列表里出现这一行（服务端排序是 created_at 倒序，新文件在最前）
    const row = page.locator('.ant-table-tbody tr.ant-table-row', { hasText: name }).first();
    await expect(row).toBeVisible({ timeout: 10_000 });

    // 下载：文件名与内容都要对
    await row.getByLabel(/更多操作/).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: '下载' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(name);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString('utf8')).toBe(content);

    // 清理：删掉刚传的，别污染后续用例
    await row.getByLabel(/更多操作/).click();
    await page.getByRole('menuitem', { name: '删除' }).click();
    await expect(row).toBeHidden({ timeout: 10_000 });
  });

  test('风险：风险列表与等级统计面板有数据', async ({ page }) => {
    const summary = await apiGet<{
      total: number;
      byLevel: { high: { count: number } };
      byStatus: { open: number };
    }>(api, '/api/risks/summary');

    await page.goto('/risks', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1, name: '问题风险' })).toBeVisible();

    for (const title of [
      '风险分布矩阵',
      '风险状态统计',
      '问题处理状态',
      '待处理的关键问题',
      '风险问题列表',
      '风险应对计划',
    ]) {
      await expectPanel(page, title);
    }

    // 指标卡 === 接口汇总
    expect(await metricValue(page, '高风险数')).toBe(String(summary.byLevel.high.count));
    expect(await metricValue(page, '待解决问题数')).toBe(String(summary.byStatus.open));

    // 列表与应对计划里真的有造出来的风险
    await expectPanelContains(page, '风险问题列表', `${PREFIX}风险-高危`);
    await expectPanelContains(page, '风险应对计划', `${PREFIX}应对措施`);
  });

  test('数据看板：趋势与排行面板有数据（已并入工作台，/analytics 重定向）', async ({ page }) => {
    await page.goto('/analytics', { waitUntil: 'networkidle' });
    // D-24：数据统计独立入口取消，老链接回工作台
    await expect(page.getByRole('heading', { level: 1, name: '工作台' })).toBeVisible();

    for (const title of [
      '任务完成趋势',
      '任务分类分布',
      '项目进度分布',
      '团队工作量统计',
      '任务状态统计',
      '项目完成率排行',
    ]) {
      await expectPanel(page, title);
    }

    await expectPanelContains(page, '项目完成率排行', `${PREFIX}冒烟项目`);
  });

  test('个人资料：真实页面（可改姓名，账号只读）', async ({ page }) => {
    await page.goto('/settings/profile', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1, name: '个人资料' })).toBeVisible();
    // 个人资料页已从占位做成真实页面（2026-11-05）：断言真实内容
    await expect(page.getByLabel('姓名')).toBeVisible();
    // 2026-11-06 重构：账号从「disabled 输入框」改成只读文本行（不再重复渲染一遍），
    // 所以这里断言"能看到账号值 + 页面上没有账号输入框"。
    const accountRow = page.locator('.wb-setting-row').filter({ hasText: '账号' }).first();
    await expect(accountRow).toContainText('admin');
    await expect(page.getByRole('textbox', { name: '账号' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '保存' })).toBeVisible();
  });
});
