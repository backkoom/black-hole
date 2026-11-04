import type { ThemeConfig } from 'antd';

/**
 * 设计变量 —— 来自 docs/contracts/visual-baseline.md §1.1 / §1.2 / §2.1。
 * AntD 通过 ConfigProvider theme.token 注入（见 antdTheme）；
 * 同一份值在 styles/global.css 里以 CSS 变量形式供自定义样式使用。
 */
export const designVars = {
  bg: '#f4f6fa',
  card: '#ffffff',
  border: '#e6eaf2',
  text: '#1f2937',
  text2: '#5b6577',
  muted: '#98a1b3',
  primary: '#2563eb',
  primaryHover: '#1d4ed8',
  primarySoft: '#eef3ff',
  green: '#10b981',
  orange: '#f59e0b',
  purple: '#8b5cf6',
  red: '#ef4444',
  radius: 12,

  /* ── 状态语义色（2026-11-04 对齐设计稿）─────────────────────────
   * 设计稿的约定：待开始=灰 / 进行中=绿 / 待审核=橙 / 已完成=紫 / 逾期=红。
   * 语义色与 AntD token 解耦 —— AntD 的 success=green 是「成功」，
   * 而这里的 green 是「进行中」，两者含义不同，不能混用同一个 token。 */
  statusTodo: '#98a1b3',
  statusDoing: '#10b981',
  statusReview: '#f59e0b',
  statusDone: '#8b5cf6',
  statusOverdue: '#ef4444',

  /* 淡色底 —— 指标卡图标底、图表浅色填充 */
  softBlue: '#eef3ff',
  softGreen: '#e9f9f1',
  softOrange: '#fff4e5',
  softPurple: '#f3ecff',
  softRed: '#feecec',
  softGray: '#f1f3f7',
  /** 左侧导航 —— 2026-11-04 由深色改为浅色（对齐设计稿：白底 + 淡蓝选中） */
  siderWidth: 208,
  siderBg: '#ffffff',
  siderHoverBg: '#f4f6fa',
  siderActiveBg: '#e8f1ff',
  siderText: '#374151',
  siderTextActive: '#2563eb',
  siderIcon: '#9ca3af',
  siderIconActive: '#2563eb',
  siderBorder: '#e6eaf2',
  /** 设置页左侧子导航 */
  settingsNavWidth: 200,
  /** 顶部栏 */
  headerHeight: 56,
  headerPadding: '0 22px',
  /** 内容区 */
  contentPadding: '20px 22px 30px',
  contentMaxWidth: 1440,
  /** 页面标题 20px（visual-baseline §1.5） */
  pageTitleSize: 20,
  /** 正文 14px（pages.md 全局设计基线） */
  bodySize: 14,
} as const;

/**
 * AntD 5 主题 —— visual-baseline.md §3.10 的 token 映射，
 * 叠加 pages.md 全局设计基线的字体与字号。
 */
export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: designVars.primary,
    colorPrimaryHover: designVars.primaryHover,
    colorPrimaryBg: designVars.primarySoft,
    colorSuccess: designVars.green,
    colorWarning: designVars.orange,
    colorError: designVars.red,
    colorInfo: designVars.primary,
    colorText: designVars.text,
    colorTextSecondary: designVars.text2,
    colorTextTertiary: designVars.muted,
    colorBorder: designVars.border,
    colorBorderSecondary: designVars.border,
    colorBgLayout: designVars.bg,
    colorBgContainer: designVars.card,
    borderRadius: designVars.radius,
    borderRadiusLG: designVars.radius,
    fontSize: designVars.bodySize,
    fontFamily: 'system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif',
    controlHeight: 34,
    lineHeight: 1.6,
  },
  components: {
    Layout: {
      bodyBg: designVars.bg,
      headerBg: designVars.card,
      headerHeight: designVars.headerHeight,
      headerPadding: designVars.headerPadding,
      siderBg: designVars.siderBg,
    },
    Menu: {
      // 浅色侧栏（2026-11-04 改）—— 设计稿是白底淡蓝选中，不是深色
      itemBg: designVars.siderBg,
      subMenuItemBg: designVars.siderBg,
      itemColor: designVars.siderText,
      itemHoverBg: designVars.siderHoverBg,
      itemHoverColor: designVars.primary,
      itemSelectedBg: designVars.siderActiveBg,
      itemSelectedColor: designVars.siderTextActive,
      itemBorderRadius: 8,
      itemHeight: 38,
      iconSize: 16,
      iconMarginInlineEnd: 10,
      itemMarginInline: 8,
      itemMarginBlock: 2,
      collapsedWidth: 64,
    },
  },
};
