import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../../app.js';
import { closeDb, getDb, migrate } from '../../db/index.js';
import { createTestUser } from '../auth/auth.testHelpers.js';
import { EVENT_CATEGORIES } from '../events/events.types.js';
import type { EventCategory } from '../events/events.types.js';
import { listEventSubscribers } from './subscriptions.service.js';

/** 只因為追蹤類別而成為通知對象的使用者（sourceId 0 不對應任何來源） */
const listSubscribersByCategory = (category: EventCategory) =>
  listEventSubscribers({ category, sourceId: 0 });

process.env.DATABASE_PATH = ':memory:';

interface CategorySubscription {
  category: string;
  label: string;
  subscribed: boolean;
}

let server: Server;
let baseUrl: string;

before(async () => {
  migrate();
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  closeDb();
});

interface SourceFollow {
  id: number;
  name: string;
  type: string;
  followed: boolean;
}

async function request(
  method: string,
  path: string,
  options: { cookie?: string; body?: unknown } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : {}) as {
      categories?: CategorySubscription[];
      sources?: SourceFollow[];
      emailNotifications?: boolean;
      error?: string;
    },
  };
}

function subscribedCategories(categories: CategorySubscription[] | undefined): string[] {
  assert.ok(categories);
  return categories.filter((item) => item.subscribed).map((item) => item.category);
}

function countRows(userId: number): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS count FROM category_subscriptions WHERE user_id = ?')
    .get(userId);
  return Number(row?.count);
}

describe('訂閱活動類別（US-07）', () => {
  test('訪客不能查看、訂閱或取消訂閱', async () => {
    assert.equal((await request('GET', '/api/subscriptions')).status, 401);
    assert.equal((await request('PUT', '/api/subscriptions/lecture')).status, 401);
    assert.equal((await request('DELETE', '/api/subscriptions/lecture')).status, 401);
  });

  test('登入後列出所有類別，預設皆未訂閱', async () => {
    const { cookie } = createTestUser();
    const { status, body } = await request('GET', '/api/subscriptions', { cookie });
    assert.equal(status, 200);
    assert.deepEqual(
      body.categories?.map((item) => item.category),
      [...EVENT_CATEGORIES],
    );
    assert.deepEqual(body.categories?.[0], {
      category: 'lecture',
      label: '講座',
      subscribed: false,
    });
    assert.deepEqual(subscribedCategories(body.categories), []);
  });

  test('可以訂閱多個類別，訂閱狀態會反映在清單', async () => {
    const { cookie } = createTestUser();
    const first = await request('PUT', '/api/subscriptions/lecture', { cookie });
    assert.equal(first.status, 200);
    assert.deepEqual(subscribedCategories(first.body.categories), ['lecture']);
    await request('PUT', '/api/subscriptions/welfare', { cookie });
    const { body } = await request('GET', '/api/subscriptions', { cookie });
    assert.deepEqual(subscribedCategories(body.categories), ['lecture', 'welfare']);
  });

  test('重複訂閱同一類別不會產生重複資料', async () => {
    const { cookie, id } = createTestUser();
    assert.equal((await request('PUT', '/api/subscriptions/sports', { cookie })).status, 200);
    const again = await request('PUT', '/api/subscriptions/sports', { cookie });
    assert.equal(again.status, 200);
    assert.deepEqual(subscribedCategories(again.body.categories), ['sports']);
    assert.equal(countRows(id), 1);
  });

  test('取消訂閱後狀態更新，且不再被視為訂閱者', async () => {
    const { cookie, id } = createTestUser({ email: 'cancel@example.com' });
    await request('PUT', '/api/subscriptions/workshop', { cookie });
    await request('PUT', '/api/subscriptions/exhibition', { cookie });
    assert.deepEqual(
      listSubscribersByCategory('workshop').map((subscriber) => subscriber.email),
      ['cancel@example.com'],
    );

    const cancelled = await request('DELETE', '/api/subscriptions/workshop', { cookie });
    assert.equal(cancelled.status, 200);
    assert.deepEqual(subscribedCategories(cancelled.body.categories), ['exhibition']);
    assert.deepEqual(listSubscribersByCategory('workshop'), []);
    assert.equal(countRows(id), 1);

    // 沒訂閱的類別再取消一次也視為成功
    assert.equal((await request('DELETE', '/api/subscriptions/workshop', { cookie })).status, 200);
  });

  test('每個使用者只看到自己的訂閱', async () => {
    const alice = createTestUser();
    const bob = createTestUser();
    await request('PUT', '/api/subscriptions/lecture', { cookie: alice.cookie });
    const { body } = await request('GET', '/api/subscriptions', { cookie: bob.cookie });
    assert.deepEqual(subscribedCategories(body.categories), []);
    const subscriberIds = listSubscribersByCategory('lecture').map(
      (subscriber) => subscriber.userId,
    );
    assert.ok(subscriberIds.includes(alice.id));
    assert.ok(!subscriberIds.includes(bob.id));
  });

  test('不存在的類別回傳 404，且不會寫入資料', async () => {
    const { cookie, id } = createTestUser();
    for (const category of ['unknown', 'LECTURE', '1']) {
      const subscribed = await request('PUT', `/api/subscriptions/${category}`, { cookie });
      assert.equal(subscribed.status, 404, category);
      assert.equal(subscribed.body.error, 'not_found');
      const cancelled = await request('DELETE', `/api/subscriptions/${category}`, { cookie });
      assert.equal(cancelled.status, 404, category);
    }
    assert.equal(countRows(id), 0);
  });

  test('刪除使用者時一併刪除訂閱', async () => {
    const { cookie, id } = createTestUser();
    await request('PUT', '/api/subscriptions/lecture', { cookie });
    getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
    assert.equal(countRows(id), 0);
  });
});

describe('追蹤來源與 Email 通知開關（#76）', () => {
  /** 建立一個已核准、一個待審核的來源，回傳兩者的 id */
  function seedSourcePair(ownerId: number, label: string): { approved: number; pending: number } {
    const insert = getDb().prepare(
      `INSERT INTO sources (name, url, type, review_status, submitted_by)
      VALUES (?, ?, 'club_site', ?, ?) RETURNING id`,
    );
    const approved = insert.get(
      `${label}社團`,
      `https://example.com/${label}/a`,
      'approved',
      ownerId,
    );
    const pending = insert.get(
      `${label}待審`,
      `https://example.com/${label}/p`,
      'pending',
      ownerId,
    );
    return { approved: Number(approved?.id), pending: Number(pending?.id) };
  }

  function followedSources(sources: SourceFollow[] | undefined): number[] {
    assert.ok(sources);
    return sources.filter((source) => source.followed).map((source) => source.id);
  }

  test('訪客無法追蹤來源或變更通知設定', async () => {
    assert.equal((await request('PUT', '/api/subscriptions/sources/1')).status, 401);
    assert.equal((await request('DELETE', '/api/subscriptions/sources/1')).status, 401);
    assert.equal(
      (
        await request('PATCH', '/api/subscriptions/settings', {
          body: { emailNotifications: false },
        })
      ).status,
      401,
    );
  });

  test('只列出已核准的來源，可追蹤與取消追蹤，重複操作結果相同', async () => {
    const { cookie, id } = createTestUser();
    const sources = seedSourcePair(id, 'follow');

    const initial = await request('GET', '/api/subscriptions', { cookie });
    const listed = initial.body.sources?.map((source) => source.id) ?? [];
    assert.ok(listed.includes(sources.approved));
    assert.ok(!listed.includes(sources.pending));
    assert.deepEqual(followedSources(initial.body.sources), []);
    assert.equal(initial.body.emailNotifications, true);

    const path = `/api/subscriptions/sources/${sources.approved}`;
    assert.equal((await request('PUT', path, { cookie })).status, 200);
    const again = await request('PUT', path, { cookie });
    assert.equal(again.status, 200);
    assert.deepEqual(followedSources(again.body.sources), [sources.approved]);
    assert.equal(
      getDb().prepare('SELECT count(*) AS n FROM source_follows WHERE user_id = ?').get(id)?.n,
      1,
    );

    const cancelled = await request('DELETE', path, { cookie });
    assert.equal(cancelled.status, 200);
    assert.deepEqual(followedSources(cancelled.body.sources), []);
    assert.equal((await request('DELETE', path, { cookie })).status, 200);
  });

  test('未核准、不存在或格式錯誤的來源回傳 404', async () => {
    const { cookie, id } = createTestUser();
    const sources = seedSourcePair(id, 'invalid');
    for (const sourceId of [String(sources.pending), '99999', 'abc', '0']) {
      const response = await request('PUT', `/api/subscriptions/sources/${sourceId}`, { cookie });
      assert.equal(response.status, 404, sourceId);
    }
    assert.equal(
      getDb().prepare('SELECT count(*) AS n FROM source_follows WHERE user_id = ?').get(id)?.n,
      0,
    );
  });

  test('追蹤來源的使用者是該來源新活動的通知對象；關閉 Email 通知後不是', async () => {
    const { cookie, id } = createTestUser();
    const sources = seedSourcePair(id, 'notify');
    await request('PUT', `/api/subscriptions/sources/${sources.approved}`, { cookie });
    const recipients = () =>
      listEventSubscribers({ category: 'sports', sourceId: sources.approved }).map(
        (subscriber) => subscriber.userId,
      );
    assert.ok(recipients().includes(id));

    const off = await request('PATCH', '/api/subscriptions/settings', {
      cookie,
      body: { emailNotifications: false },
    });
    assert.equal(off.status, 200);
    assert.equal(off.body.emailNotifications, false);
    assert.ok(!recipients().includes(id));
    // 關閉通知不影響追蹤狀態
    assert.deepEqual(followedSources(off.body.sources), [sources.approved]);

    const on = await request('PATCH', '/api/subscriptions/settings', {
      cookie,
      body: { emailNotifications: true },
    });
    assert.equal(on.body.emailNotifications, true);
    assert.ok(recipients().includes(id));
  });

  test('同時追蹤類別與來源的使用者只會出現一次', async () => {
    const { cookie, id } = createTestUser();
    const sources = seedSourcePair(id, 'both');
    await request('PUT', `/api/subscriptions/sources/${sources.approved}`, { cookie });
    await request('PUT', '/api/subscriptions/welfare', { cookie });
    const recipients = listEventSubscribers({ category: 'welfare', sourceId: sources.approved });
    assert.equal(recipients.filter((subscriber) => subscriber.userId === id).length, 1);
  });

  test('追蹤內容領域的使用者是該領域新活動的通知對象', async () => {
    const { cookie, id } = createTestUser();
    await request('PUT', '/api/subscriptions/topics/security', { cookie });
    const recipients = (topics: string[]) =>
      listEventSubscribers({ category: 'other', sourceId: 0, topics }).map(
        (subscriber) => subscriber.userId,
      );
    assert.ok(recipients(['ai', 'security']).includes(id));
    assert.ok(!recipients(['ai']).includes(id));
  });

  test('通知設定的值不是布林時回傳 400', async () => {
    const { cookie } = createTestUser();
    for (const body of [{}, { emailNotifications: 'no' }, { emailNotifications: 0 }]) {
      const response = await request('PATCH', '/api/subscriptions/settings', { cookie, body });
      assert.equal(response.status, 400);
    }
  });
});
