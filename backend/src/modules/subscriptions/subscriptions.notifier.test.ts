import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { closeDb, getDb, migrate } from '../../db/index.js';
import { processAnnouncement } from '../events/events.service.js';
import type { EventCategory, RawAnnouncement } from '../events/events.types.js';
import { seedSources } from '../sources/sources.testHelpers.js';
import type { EmailMessage } from './subscriptions.email.js';
import { buildNewEventEmail, formatEventTime } from './subscriptions.email.js';
import type { Mailer } from './subscriptions.mailer.js';
import {
  MAX_SEND_ATTEMPTS,
  retryFailedNotifications,
  runNotificationCycle,
} from './subscriptions.notifier.js';
import { subscribeCategory, unsubscribeCategory } from './subscriptions.service.js';

process.env.DATABASE_PATH = ':memory:';

const BASE_URL = 'https://eventou.example';
const reference = '2026-10-01T09:00:00+08:00';
// 活動都在 10/7 之後，通知時間設在活動之前
const now = new Date('2026-10-02T00:00:00Z');

let nextUrl = 1;
let alice: number;
let bob: number;

/** 記下寄出的信；failing 為 true 時模擬寄送失敗。 */
function createFakeMailer() {
  const sent: EmailMessage[] = [];
  const mailer: Mailer & { failing: boolean } = {
    failing: false,
    async send(message) {
      if (this.failing) throw new Error('SMTP 連線逾時');
      sent.push(message);
    },
  };
  return { sent, mailer };
}

function createUser(email: string): number {
  const result = getDb()
    .prepare("INSERT INTO users (email, password_hash, display_name) VALUES (?, 'x', ?)")
    .run(email, email.split('@')[0]);
  return Number(result.lastInsertRowid);
}

function createEvent(
  category: EventCategory,
  overrides: Partial<RawAnnouncement> = {},
  url = `https://www.ntou.edu.tw/event/${nextUrl++}`,
) {
  return processAnnouncement(
    getDb(),
    {
      sourceId: 1,
      url,
      title: '海大講座',
      rawContent: '活動日期：2026/10/07 14:00-16:00\n地點：甲子廳',
      publishedAt: reference,
      fetchedAt: reference,
      ...overrides,
    },
    { defaultCategory: category },
  );
}

function notifications() {
  return getDb()
    .prepare(
      'SELECT event_id, user_id, status, attempts, last_error, sent_at FROM event_notifications ORDER BY id',
    )
    .all();
}

before(() => {
  migrate();
  seedSources(getDb()); // 來源 1，同時建立 id 1 的 seed 使用者
  getDb().prepare("UPDATE sources SET review_status = 'approved' WHERE id = 1").run();
  alice = createUser('alice@example.com');
  bob = createUser('bob@example.com');
});

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM event_notifications');
  db.exec('DELETE FROM event_notification_dispatches');
  db.exec('DELETE FROM category_subscriptions');
  db.exec('DELETE FROM events');
});

after(() => {
  closeDb();
});

describe('新活動 Email 通知（US-08）', () => {
  test('新活動只通知訂閱該類別的使用者', async () => {
    subscribeCategory(alice, 'lecture');
    subscribeCategory(bob, 'sports');
    const event = createEvent('lecture');
    const { sent, mailer } = createFakeMailer();

    const result = await runNotificationCycle(mailer, BASE_URL, now);

    assert.deepEqual(result, { dispatchedEvents: 1, sent: 1, failed: 0, skipped: 0 });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'alice@example.com');
    assert.match(sent[0].subject, /海大講座/);
    for (const body of [sent[0].text, sent[0].html]) {
      assert.match(body, /海大講座/);
      assert.match(body, /2026年10月7日/);
      assert.match(body, /14:00 – 16:00/);
      assert.match(body, /甲子廳/);
      assert.ok(body.includes(`${BASE_URL}/events/${event.id}`));
      assert.ok(body.includes(`${BASE_URL}/subscriptions`), '需附取消訂閱連結');
    }
    const [record] = notifications();
    assert.equal(record.user_id, alice);
    assert.equal(record.status, 'sent');
    assert.equal(record.attempts, 1);
    assert.ok(record.sent_at);
  });

  test('同一活動不會重複通知：再跑一輪、重跑擷取或活動更新都不再寄', async () => {
    subscribeCategory(alice, 'lecture');
    const url = 'https://www.ntou.edu.tw/event/repeat';
    createEvent('lecture', {}, url);
    const { sent, mailer } = createFakeMailer();
    await runNotificationCycle(mailer, BASE_URL, now);
    assert.equal(sent.length, 1);

    await runNotificationCycle(mailer, BASE_URL, now);
    createEvent('lecture', {}, url); // 重跑，內容相同
    await runNotificationCycle(mailer, BASE_URL, now);
    createEvent('lecture', { rawContent: '活動日期：2026/10/08 10:00-12:00' }, url); // 內容更新
    const result = await runNotificationCycle(mailer, BASE_URL, now);

    assert.equal(result.dispatchedEvents, 0);
    assert.equal(sent.length, 1);
    assert.equal(notifications().length, 1);
  });

  test('活動派送後才訂閱的使用者不會收到舊活動', async () => {
    createEvent('lecture');
    const { sent, mailer } = createFakeMailer();
    await runNotificationCycle(mailer, BASE_URL, now);
    subscribeCategory(alice, 'lecture');
    await runNotificationCycle(mailer, BASE_URL, now);
    assert.equal(sent.length, 0);
  });

  test('取消訂閱後不再收到該類別的通知', async () => {
    subscribeCategory(alice, 'lecture');
    subscribeCategory(bob, 'lecture');
    unsubscribeCategory(alice, 'lecture');
    createEvent('lecture');
    const { sent, mailer } = createFakeMailer();
    await runNotificationCycle(mailer, BASE_URL, now);
    assert.deepEqual(
      sent.map((message) => message.to),
      ['bob@example.com'],
    );
  });

  test('待審活動不通知，轉為已發布時才通知一次', async () => {
    subscribeCategory(alice, 'lecture');
    const url = 'https://www.ntou.edu.tw/event/review';
    createEvent('lecture', { title: null }, url); // 缺標題 → needs_review
    const { sent, mailer } = createFakeMailer();
    assert.equal((await runNotificationCycle(mailer, BASE_URL, now)).dispatchedEvents, 0);
    assert.equal(sent.length, 0);

    createEvent('lecture', {}, url); // 補上標題 → published
    await runNotificationCycle(mailer, BASE_URL, now);
    await runNotificationCycle(mailer, BASE_URL, now);
    assert.equal(sent.length, 1);
  });

  test('已經結束的活動與未核准來源的活動不通知', async () => {
    subscribeCategory(alice, 'lecture');
    createEvent('lecture');
    const { sent, mailer } = createFakeMailer();
    // 活動結束後才第一次派送：記為已派送但不寄信
    const afterEvent = new Date('2026-10-08T00:00:00Z');
    const result = await runNotificationCycle(mailer, BASE_URL, afterEvent);
    assert.equal(result.dispatchedEvents, 1);
    assert.equal(sent.length, 0);

    getDb().prepare("UPDATE sources SET review_status = 'rejected' WHERE id = 1").run();
    try {
      createEvent('lecture');
      assert.equal((await runNotificationCycle(mailer, BASE_URL, now)).dispatchedEvents, 0);
      assert.equal(sent.length, 0);
    } finally {
      getDb().prepare("UPDATE sources SET review_status = 'approved' WHERE id = 1").run();
    }
  });

  test('寄送失敗會記錄原因並在下一輪重試', async () => {
    subscribeCategory(alice, 'lecture');
    createEvent('lecture');
    const { sent, mailer } = createFakeMailer();
    mailer.failing = true;

    const failed = await runNotificationCycle(mailer, BASE_URL, now);
    assert.deepEqual(failed, { dispatchedEvents: 1, sent: 0, failed: 1, skipped: 0 });
    let [record] = notifications();
    assert.equal(record.status, 'pending');
    assert.equal(record.attempts, 1);
    assert.equal(record.last_error, 'SMTP 連線逾時');
    assert.equal(record.sent_at, null);

    mailer.failing = false;
    const retried = await runNotificationCycle(mailer, BASE_URL, now);
    assert.equal(retried.sent, 1);
    assert.equal(sent.length, 1);
    [record] = notifications();
    assert.equal(record.status, 'sent');
    assert.equal(record.attempts, 2);
    assert.equal(record.last_error, null);
  });

  test('重試用盡後標記為 failed，可手動排入重試', async () => {
    subscribeCategory(alice, 'lecture');
    createEvent('lecture');
    const { sent, mailer } = createFakeMailer();
    mailer.failing = true;
    for (let i = 0; i < MAX_SEND_ATTEMPTS + 2; i += 1) {
      await runNotificationCycle(mailer, BASE_URL, now);
    }
    let [record] = notifications();
    assert.equal(record.status, 'failed');
    assert.equal(record.attempts, MAX_SEND_ATTEMPTS);

    mailer.failing = false;
    await runNotificationCycle(mailer, BASE_URL, now);
    assert.equal(sent.length, 0, 'failed 不會自動再寄');

    assert.equal(retryFailedNotifications(now), 1);
    await runNotificationCycle(mailer, BASE_URL, now);
    assert.equal(sent.length, 1);
    [record] = notifications();
    assert.equal(record.status, 'sent');
  });

  test('寄出前已取消訂閱的待寄通知改為 skipped', async () => {
    subscribeCategory(alice, 'lecture');
    createEvent('lecture');
    const { sent, mailer } = createFakeMailer();
    mailer.failing = true;
    await runNotificationCycle(mailer, BASE_URL, now);

    unsubscribeCategory(alice, 'lecture');
    mailer.failing = false;
    const result = await runNotificationCycle(mailer, BASE_URL, now);
    assert.equal(result.skipped, 1);
    assert.equal(sent.length, 0);
    assert.equal(notifications()[0].status, 'skipped');
  });
});

describe('通知信內容', () => {
  const event = {
    id: 3,
    title: '<b>餐券</b> & 講座',
    categoryLabel: '餐飲／福利',
    startTime: '2026-10-12T00:00:00+08:00',
    endTime: '2026-10-15T00:00:00+08:00',
    allDay: true,
    location: null,
    originalUrl: 'https://example.com/a?x=1&y=2',
  };

  test('全天活動只顯示日期，結束日為實際的最後一天', () => {
    assert.equal(formatEventTime(event), '2026年10月12日 週一 – 2026年10月14日 週三');
    assert.equal(formatEventTime({ ...event, endTime: null }), '2026年10月12日 週一');
  });

  test('HTML 內容會跳脫特殊字元，沒有地點時顯示未提供', () => {
    const message = buildNewEventEmail(
      { email: 'a@example.com', displayName: '<Amy>' },
      event,
      BASE_URL,
    );
    assert.ok(message.html.includes('&lt;b&gt;餐券&lt;/b&gt; &amp; 講座'));
    assert.ok(message.html.includes('&lt;Amy&gt;'));
    assert.ok(message.html.includes('https://example.com/a?x=1&amp;y=2'));
    assert.ok(!message.html.includes('<b>'));
    assert.match(message.text, /地點：未提供/);
    assert.ok(message.text.includes('<b>餐券</b> & 講座'));
  });
});
