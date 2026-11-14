import type { DatabaseSync } from 'node:sqlite';
import type { EventCategory } from '../events/events.types.js';

export interface MapEvent {
  id: number;
  title: string;
  category: EventCategory;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  location: string;
}

export interface MapCoordinates {
  latitude: number;
  longitude: number;
}

/** 取得已發布活動的地點；活動不存在或未發布時回傳 undefined。 */
export function findMapEventLocation(db: DatabaseSync, eventId: number): string | null | undefined {
  const row = db.prepare('SELECT location FROM published_events WHERE id = ?').get(eventId) as
    { location: string | null } | undefined;
  return row?.location;
}

// 時間皆存成 YYYY-MM-DDTHH:mm:ss+08:00（見 docs/event-schema.md），前 10 碼即台北日期
const FIRST_DAY_SQL = 'substr(start_time, 1, 10)';

/**
 * 活動最後一天（台北日期）：
 * - 沒有 end_time：與開始日期相同
 * - end_time 為 00:00（全天活動的 end_time 是結束日隔天 00:00，或一般活動到午夜結束）：前一天
 * - 其餘：end_time 的日期
 * 最後一天不會早於開始日期，避免資料異常時把活動排除在外。
 */
const LAST_DAY_SQL = `max(${FIRST_DAY_SQL}, CASE
    WHEN end_time IS NULL THEN ${FIRST_DAY_SQL}
    WHEN substr(end_time, 12, 8) = '00:00:00' THEN date(substr(end_time, 1, 10), '-1 day')
    ELSE substr(end_time, 1, 10)
  END)`;

export function findMapEvents(
  db: DatabaseSync,
  filters: { category: string; from: string; to: string },
): MapEvent[] {
  const conditions = ['location IS NOT NULL', 'length(trim(location)) > 0'];
  const params: string[] = [];
  if (filters.category) {
    conditions.push('category = ?');
    params.push(filters.category);
  }
  // 活動期間與篩選範圍（含兩端）有重疊就顯示，跨多天的活動在進行中的每一天都看得到
  if (filters.from) {
    conditions.push(`${LAST_DAY_SQL} >= ?`);
    params.push(filters.from);
  }
  if (filters.to) {
    conditions.push(`${FIRST_DAY_SQL} <= ?`);
    params.push(filters.to);
  }

  const rows = db
    .prepare(
      `SELECT id, title, category, start_time, end_time, all_day, location
       FROM published_events WHERE ${conditions.join(' AND ')} ORDER BY start_time, id`,
    )
    .all(...params);

  return rows.map((row) => ({
    id: Number(row.id),
    title: String(row.title),
    category: String(row.category) as EventCategory,
    startTime: String(row.start_time),
    endTime: row.end_time === null ? null : String(row.end_time),
    allDay: Number(row.all_day) === 1,
    location: String(row.location),
  }));
}
