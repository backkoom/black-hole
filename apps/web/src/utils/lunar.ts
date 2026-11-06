import solarLunar from 'solarlunar';

/**
 * 农历 / 节气 / 节日 —— 月历格子里那行小字。
 *
 * 为什么用 solarlunar：农历不是简单换算（要查朔望月与闰月表，1900–2100 是一张
 * 固定表），自己手抄 200 多行十六进制常量出错概率太高。这个库只有十几 KB、
 * 纯计算无网络依赖，内网离线环境也能跑（打包进 bundle，不回源）。
 *
 * 2026-11-06 加：之前月历只有公历日 + 任务点，看不出初几、也不知道哪天休息。
 */

/** 传统节日（农历月-日 → 名称）。除夕单独判：它是腊月最后一天，不是固定日期 */
const LUNAR_FESTIVALS: Record<string, string> = {
  '1-1': '春节',
  '1-15': '元宵节',
  '2-2': '龙抬头',
  '5-5': '端午节',
  '7-7': '七夕',
  '7-15': '中元节',
  '8-15': '中秋节',
  '9-9': '重阳节',
  '12-8': '腊八节',
};

/** 公历节日（固定日期，只保留国内常用的） */
const SOLAR_FESTIVALS: Record<string, string> = {
  '1-1': '元旦',
  '3-8': '妇女节',
  '5-1': '劳动节',
  '5-4': '青年节',
  '6-1': '儿童节',
  '7-1': '建党节',
  '8-1': '建军节',
  '9-10': '教师节',
  '10-1': '国庆节',
};

export interface LunarDayInfo {
  /** 正月 / 二月 / 闰四月 … */
  monthCn: string;
  /** 初一 / 十五 / 廿三 … */
  dayCn: string;
  /** 农历日（1-30） */
  day: number;
  /** 农历月（1-12） */
  month: number;
  isLeap: boolean;
  /** 二十四节气（当天才有，如「清明」） */
  term?: string;
  /** 节日名（传统节日优先于公历节日） */
  festival?: string;
  /** 格子里显示的小字：节气 > 节日 > 初一显示月名 > 其余显示日名 */
  label: string;
  /** 是否值得标红（节气或节日） */
  highlight: boolean;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * 取某一天的农历信息。
 * @param date `YYYY-MM-DD` 或 Date（按本地年月日取，不做时区换算）
 */
export function getLunarInfo(date: string | Date): LunarDayInfo {
  let y: number;
  let m: number;
  let d: number;
  if (typeof date === 'string') {
    const [ys, ms, ds] = date.split('-');
    y = Number(ys);
    m = Number(ms);
    d = Number(ds);
  } else {
    y = date.getFullYear();
    m = date.getMonth() + 1;
    d = date.getDate();
  }

  const info = solarLunar.solar2lunar(y, m, d) as {
    lMonth: number;
    lDay: number;
    isLeap: boolean;
    monthCn: string;
    dayCn: string;
    term?: string;
  };

  const lunarKey = `${info.lMonth}-${info.lDay}`;
  let festival = LUNAR_FESTIVALS[lunarKey] ?? SOLAR_FESTIVALS[`${m}-${d}`];

  // 除夕：农历腊月且第二天就是正月初一
  if (!festival && info.lMonth === 12) {
    const tomorrow = solarLunar.solar2lunar(
      ...((): [number, number, number] => {
        const t = new Date(y, m - 1, d + 1);
        return [t.getFullYear(), t.getMonth() + 1, t.getDate()];
      })(),
    ) as { lMonth: number; lDay: number };
    if (tomorrow.lMonth === 1 && tomorrow.lDay === 1) festival = '除夕';
  }

  const term = info.term || undefined;
  const isFirstDay = info.lDay === 1;
  const label = term ?? festival ?? (isFirstDay ? info.monthCn : info.dayCn);

  return {
    monthCn: info.monthCn,
    dayCn: info.dayCn,
    day: info.lDay,
    month: info.lMonth,
    isLeap: info.isLeap,
    term,
    festival,
    label,
    highlight: Boolean(term || festival),
  };
}

/** 完整农历描述，给 tooltip / 详情面板用：「农历八月廿一」 */
export function lunarText(date: string | Date): string {
  const info = getLunarInfo(date);
  const leap = info.isLeap ? '闰' : '';
  return `农历${leap}${info.monthCn}${info.dayCn}`;
}

/** 给 `Date` 转成 `YYYY-MM-DD`（本地时区，不做 UTC 位移） */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
