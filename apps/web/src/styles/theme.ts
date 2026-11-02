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
  /** 左侧导航 */
  siderWidth: 208,
  siderBg: '#1c2033',
  siderHoverBg: '#252a40',
  siderActiveBg: '#2d3552',
  siderText: '#9aa3bd',
  siderTextActive: '#ffffff',
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
      darkItemBg: designVars.siderBg,
      darkSubMenuItemBg: designVars.siderBg,
      darkItemColor: designVars.siderText,
      darkItemHoverBg: designVars.siderHoverBg,
      darkItemHoverColor: '#dfe4f2',
      darkItemSelectedBg: designVars.siderActiveBg,
      darkItemSelectedColor: designVars.siderTextActive,
      itemBorderRadius: 8,
      itemHeight: 38,
      iconSize: 16,
    },
  },
};
