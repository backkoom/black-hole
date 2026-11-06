/**
 * 法定节假日与调休 —— 月历上的「休 / 班」角标。
 *
 * 数据来源：国务院办公厅《关于 2026 年部分节假日安排的通知》
 *          国办发明电〔2025〕7 号（2025-11-04 发布）。
 *
 * 为什么不"自动同步"：这是**内网离线部署**，生产服务器没有外网，
 * 任何在线节假日 API 到客户现场都会失败。节假日安排每年 11 月由国办发一次，
 * 一年只需维护一次，所以做成内置表 + 明确标注数据年份，比"看起来会自动更新
 * 但现场永远拉不到"更可靠。
 *
 * 新增一年的做法：在 HOLIDAY_YEARS 里加一项，把官方通知里的放假区间和
 * 调休上班日记进去即可；不配置的年份不会显示休/班角标（农历和节日照常显示）。
 */

export type HolidayKind = 'off' | 'work';

export interface HolidayDay {
  /** 节日名，如「春节」；调休上班日也用所属节日名 */
  name: string;
  kind: HolidayKind;
}

interface HolidayYearConfig {
  /** 官方文号，界面上标注出处用 */
  source: string;
  /** 放假区间：[起, 止, 名称]，含首尾 */
  off: Array<[string, string, string]>;
  /** 调休上班日（周末要上班的那几天） */
  work: Array<[string, string]>;
}

const HOLIDAY_YEARS: Record<number, HolidayYearConfig> = {
  2026: {
    source: '国办发明电〔2025〕7号',
    off: [
      ['2026-01-01', '2026-01-03', '元旦'],
      ['2026-02-15', '2026-02-23', '春节'],
      ['2026-04-04', '2026-04-06', '清明节'],
      ['2026-05-01', '2026-05-05', '劳动节'],
      ['2026-06-19', '2026-06-21', '端午节'],
      ['2026-09-25', '2026-09-27', '中秋节'],
      ['2026-10-01', '2026-10-07', '国庆节'],
    ],
    work: [
      ['2026-01-04', '元旦'],
      ['2026-02-14', '春节'],
      ['2026-02-28', '春节'],
      ['2026-05-09', '劳动节'],
      ['2026-09-20', '国庆节'],
      ['2026-10-10', '国庆节'],
    ],
  },
};

/** 已配置的年份 → 数据出处，给界面上的标注用 */
export const HOLIDAY_SOURCES: Record<number, string> = Object.fromEntries(
  Object.entries(HOLIDAY_YEARS).map(([year, cfg]) => [Number(year), cfg.source]),
);

/** 展开成 日期 → 信息 的索引；按需构建一次 */
const indexCache = new Map<number, Map<string, HolidayDay>>();

function buildIndex(year: number): Map<string, HolidayDay> {
  const cached = indexCache.get(year);
  if (cached) return cached;

  const map = new Map<string, HolidayDay>();
  const cfg = HOLIDAY_YEARS[year];
  if (!cfg) {
    indexCache.set(year, map);
    return map;
  }

  const addDay = (key: string, name: string, kind: HolidayKind) => {
    map.set(key, { name, kind });
  };

  for (const [from, to, name] of cfg.off) {
    const cursor = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    while (cursor <= end) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(
        cursor.getDate(),
      ).padStart(2, '0')}`;
      addDay(key, name, 'off');
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  for (const [day, name] of cfg.work) {
    // 调休上班日覆盖放假区间（理论上不重叠，保险起见后写）
    addDay(day, name, 'work');
  }

  indexCache.set(year, map);
  return map;
}

/** 取某天的节假日信息；没配置的年份返回 null */
export function getHoliday(dateKey: string): HolidayDay | null {
  const year = Number(dateKey.slice(0, 4));
  return buildIndex(year).get(dateKey) ?? null;
}

/** 该年是否有节假日数据（界面上用来决定要不要写"数据未配置"） */
export function hasHolidayData(year: number): boolean {
  return Boolean(HOLIDAY_YEARS[year]);
}
