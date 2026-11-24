import { useEffect, useState } from 'react';

const DAY_MS = 24 * 60 * 60 * 1000;
// 台北沒有日光節約時間，固定 UTC+8
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export interface TaipeiDate {
  year: number;
  month: number;
  day: number;
  /** 週日、週一…的「日」「一」 */
  weekday: string;
}

/** 以台北時間取得年月日與星期，不受使用者電腦時區影響 */
export function taipeiDate(now: Date): TaipeiDate {
  const shifted = new Date(now.getTime() + TAIPEI_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: WEEKDAYS[shifted.getUTCDay()],
  };
}

/** 距離下一個台北午夜的毫秒數 */
export function msUntilTaipeiMidnight(now: Date): number {
  return DAY_MS - ((now.getTime() + TAIPEI_OFFSET_MS) % DAY_MS);
}

/** 今天的台北日期；過了午夜或切回分頁時自動更新 */
export function useTaipeiToday(): TaipeiDate {
  const [today, setToday] = useState(() => taipeiDate(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const now = new Date();
      const next = taipeiDate(now);
      setToday((current) =>
        current.year === next.year && current.month === next.month && current.day === next.day
          ? current
          : next,
      );
      // 多等 1 秒，避免計時器提早觸發時還停在前一天
      timer = setTimeout(refresh, msUntilTaipeiMidnight(now) + 1000);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return today;
}
