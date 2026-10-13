import { getDb } from '../../db/index.js';
import type { EventCategory } from '../events/events.types.js';
import { EVENT_CATEGORY_LABELS } from '../events/events.types.js';
import type { ReviewStatus } from '../sources/sourceTypes.js';
import { buildNewEventEmail } from './subscriptions.email.js';
import type { Mailer } from './subscriptions.mailer.js';
import { isEventCategory, listSubscribersByCategory } from './subscriptions.service.js';

// US-08 新活動 Email 通知。
// 不依賴 Event upsert 的回傳值：以「這個活動有沒有派送紀錄」判斷是不是新活動，
// 所以重跑擷取、活動內容更新都不會重複通知；needs_review 轉為 published 時才第一次通知。

/** 寄送狀態：pending 等待寄送或重試、sent 已寄出、failed 重試用盡、skipped 寄出前已取消訂閱或活動已下架。 */
export const NOTIFICATION_STATUSES = ['pending', 'sent', 'failed', 'skipped'] as const;

export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/** 同一封通知最多嘗試寄送的次數，超過後標記為 failed。 */
export const MAX_SEND_ATTEMPTS = 5;

const APPROVED: ReviewStatus = 'approved';
const DAY_MS = 86400000;
const MAX_ERROR_LENGTH = 500;

export interface NotificationCycleResult {
  /** 這次新派送的活動數 */
  dispatchedEvents: number;
  sent: number;
  /** 這次寄送失敗的封數（之後會重試，直到 MAX_SEND_ATTEMPTS） */
  failed: number;
  skipped: number;
}

function sqliteTime(now: Date): string {
  return now.toISOString().slice(0, 19).replace('T', ' ');
}

/** 活動是否已經結束；沒有結束時間時，全天活動算到當天結束，其餘算到開始時間。 */
function hasEnded(
  event: { startTime: string; endTime: string | null; allDay: boolean },
  now: Date,
): boolean {
  const start = new Date(event.startTime).getTime();
  const end = event.endTime
    ? new Date(event.endTime).getTime()
    : start + (event.allDay ? DAY_MS : 0);
  return end <= now.getTime();
}

/**
 * 找出還沒派送過的已發布活動，替目前訂閱該類別的使用者建立寄送紀錄。
 * 每個活動只會派送一次；已經結束的活動只記錄為已派送，不通知。
 */
export function dispatchNewEvents(now = new Date()): number {
  const db = getDb();
  const events = db
    .prepare(
      `SELECT e.id, e.category, e.start_time, e.end_time, e.all_day
      FROM published_events e
      JOIN sources s ON s.id = e.source_id
      LEFT JOIN event_notification_dispatches d ON d.event_id = e.id
      WHERE d.event_id IS NULL AND s.review_status = ?
      ORDER BY e.id`,
    )
    .all(APPROVED);
  const insertNotification = db.prepare(
    `INSERT INTO event_notifications (event_id, user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (event_id, user_id) DO NOTHING`,
  );
  const insertDispatch = db.prepare(
    'INSERT INTO event_notification_dispatches (event_id, dispatched_at) VALUES (?, ?)',
  );
  const timestamp = sqliteTime(now);
  for (const row of events) {
    const eventId = Number(row.id);
    const ended = hasEnded(
      {
        startTime: String(row.start_time),
        endTime: row.end_time === null ? null : String(row.end_time),
        allDay: Number(row.all_day) === 1,
      },
      now,
    );
    const subscribers =
      !ended && isEventCategory(row.category) ? listSubscribersByCategory(row.category) : [];
    // 寄送紀錄與派送紀錄要一起成立，避免中途失敗後同一活動被派送兩次
    db.exec('BEGIN');
    try {
      for (const subscriber of subscribers) {
        insertNotification.run(eventId, subscriber.userId, timestamp, timestamp);
      }
      insertDispatch.run(eventId, timestamp);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
  return events.length;
}

/**
 * 寄出所有 pending 的通知。寄出前會再確認一次：使用者已取消訂閱，
 * 或活動已不是已發布狀態時不寄，標記為 skipped。
 */
export async function sendPendingNotifications(
  mailer: Mailer,
  baseUrl: string,
  now = new Date(),
): Promise<Pick<NotificationCycleResult, 'sent' | 'failed' | 'skipped'>> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT n.id, n.attempts, u.email, u.display_name,
        e.id AS event_id, e.title, e.category, e.start_time, e.end_time, e.all_day,
        e.location, e.original_url, cs.user_id AS subscribed_user_id
      FROM event_notifications n
      JOIN users u ON u.id = n.user_id
      LEFT JOIN published_events e ON e.id = n.event_id
      LEFT JOIN category_subscriptions cs ON cs.user_id = n.user_id AND cs.category = e.category
      WHERE n.status = 'pending'
      ORDER BY n.id`,
    )
    .all();
  const update = db.prepare(
    `UPDATE event_notifications
    SET status = ?, attempts = ?, last_error = ?, sent_at = ?, updated_at = ?
    WHERE id = ?`,
  );
  const result = { sent: 0, failed: 0, skipped: 0 };
  const timestamp = sqliteTime(now);
  for (const row of rows) {
    const id = Number(row.id);
    const attempts = Number(row.attempts);
    if (row.event_id === null || row.subscribed_user_id === null) {
      update.run('skipped' satisfies NotificationStatus, attempts, null, null, timestamp, id);
      result.skipped += 1;
      continue;
    }
    const category = String(row.category) as EventCategory;
    const message = buildNewEventEmail(
      { email: String(row.email), displayName: String(row.display_name) },
      {
        id: Number(row.event_id),
        title: String(row.title),
        categoryLabel: EVENT_CATEGORY_LABELS[category] ?? category,
        startTime: String(row.start_time),
        endTime: row.end_time === null ? null : String(row.end_time),
        allDay: Number(row.all_day) === 1,
        location: row.location === null ? null : String(row.location),
        originalUrl: String(row.original_url),
      },
      baseUrl,
    );
    try {
      await mailer.send(message);
      update.run('sent' satisfies NotificationStatus, attempts + 1, null, timestamp, timestamp, id);
      result.sent += 1;
    } catch (error) {
      // 留在 pending 下一輪再試；試滿次數後改為 failed，不再自動重試
      const status: NotificationStatus = attempts + 1 >= MAX_SEND_ATTEMPTS ? 'failed' : 'pending';
      const reason = (error instanceof Error ? error.message : String(error)).slice(
        0,
        MAX_ERROR_LENGTH,
      );
      update.run(status, attempts + 1, reason, null, timestamp, id);
      result.failed += 1;
    }
  }
  return result;
}

/** 把 failed 的通知改回 pending 並歸零次數，下一輪會重新寄送；回傳筆數。 */
export function retryFailedNotifications(now = new Date()): number {
  const result = getDb()
    .prepare(
      `UPDATE event_notifications SET status = 'pending', attempts = 0, updated_at = ?
      WHERE status = 'failed'`,
    )
    .run(sqliteTime(now));
  return Number(result.changes);
}

/** 一輪通知：先派送新活動，再寄出所有待寄的通知（含先前失敗待重試的）。 */
export async function runNotificationCycle(
  mailer: Mailer,
  baseUrl: string,
  now = new Date(),
): Promise<NotificationCycleResult> {
  const dispatchedEvents = dispatchNewEvents(now);
  return { dispatchedEvents, ...(await sendPendingNotifications(mailer, baseUrl, now)) };
}
