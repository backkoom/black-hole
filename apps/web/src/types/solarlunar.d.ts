/**
 * solarlunar 的类型补丁。
 *
 * 包自带 solarlunar.d.ts，但它没在 package.json 的 `exports` 里声明 `types`，
 * 在 moduleResolution: bundler 下 TS 解析不到（TS7016）。这里只声明我们真正用到的
 * 那一个方法与字段，够用且不依赖上游修包。
 */
declare module 'solarlunar' {
  export interface LunarResult {
    /** 农历年 */
    lYear: number;
    /** 农历月 1-12 */
    lMonth: number;
    /** 农历日 1-30 */
    lDay: number;
    /** 是否闰月 */
    isLeap: boolean;
    /** 正月 / 闰四月 … */
    monthCn: string;
    /** 初一 / 廿三 … */
    dayCn: string;
    /** 是否节气日 */
    isTerm: boolean;
    /** 节气名（非节气日为空串） */
    term: string;
  }

  const solarLunar: {
    solar2lunar(year: number, month: number, day: number): LunarResult;
    lunar2solar(year: number, month: number, day: number, isLeap?: boolean): {
      cYear: number;
      cMonth: number;
      cDay: number;
    };
  };

  export default solarLunar;
}
