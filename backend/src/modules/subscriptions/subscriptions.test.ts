import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../../app.js';
import { closeDb, getDb, migrate } from '../../db/index.js';
import { EVENT_CATEGORIES } from '../events/events.types.js';
import { listSubscribersByCategory } from './subscriptions.service.js';

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

async function request(method: string, path: string, options: { cookie?: string } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: options.cookie ? { Cookie: options.cookie } : {},
  });
  const text = await response.text();
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : {}) as { categories?: CategorySubscription[]; error?: string },
  };
}

async function registerUser(email: string) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123', displayName: email.split('@')[0] }),
  });
  assert.equal(response.status, 201);
  const cookie = response.headers.getSetCookie()[0]?.split(';')[0];
  assert.ok(cookie);
  const { user } = (await response.json()) as { user: { id: number } };
  return { cookie, id: user.id };
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
    const { cookie } = await registerUser('list@example.com');
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
    const { cookie } = await registerUser('multi@example.com');
    const first = await request('PUT', '/api/subscriptions/lecture', { cookie });
    assert.equal(first.status, 200);
    assert.deepEqual(subscribedCategories(first.body.categories), ['lecture']);
    await request('PUT', '/api/subscriptions/welfare', { cookie });
    const { body } = await request('GET', '/api/subscriptions', { cookie });
    assert.deepEqual(subscribedCategories(body.categories), ['lecture', 'welfare']);
  });

  test('重複訂閱同一類別不會產生重複資料', async () => {
    const { cookie, id } = await registerUser('repeat@example.com');
    assert.equal((await request('PUT', '/api/subscriptions/sports', { cookie })).status, 200);
    const again = await request('PUT', '/api/subscriptions/sports', { cookie });
    assert.equal(again.status, 200);
    assert.deepEqual(subscribedCategories(again.body.categories), ['sports']);
    assert.equal(countRows(id), 1);
  });

  test('取消訂閱後狀態更新，且不再被視為訂閱者', async () => {
    const { cookie, id } = await registerUser('cancel@example.com');
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
    const alice = await registerUser('alice@example.com');
    const bob = await registerUser('bob@example.com');
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
    const { cookie, id } = await registerUser('unknown@example.com');
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
    const { cookie, id } = await registerUser('removed@example.com');
    await request('PUT', '/api/subscriptions/lecture', { cookie });
    getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
    assert.equal(countRows(id), 0);
  });
});
