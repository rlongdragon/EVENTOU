import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../../app.js';
import { closeDb, getDb, migrate } from '../../db/index.js';
import { seedSources } from '../sources/sources.testHelpers.js';
import type { EventRatingSummary } from './events.ratings.js';
import { processAnnouncement } from './events.service.js';
import type { RawAnnouncement } from './events.types.js';

process.env.DATABASE_PATH = ':memory:';

const reference = '2026-10-01T09:00:00+08:00';
const raw: RawAnnouncement = {
  sourceId: 1,
  url: 'https://www.ntou.edu.tw/event/ratings-1',
  title: '海大講座',
  rawContent: '活動日期：2026/10/07 14:00-16:00\n地點：甲子廳\n主辦單位：國立臺灣海洋大學',
  publishedAt: reference,
  fetchedAt: reference,
};

let server: Server;
let baseUrl: string;
let eventId: number;
let otherEventId: number;
let reviewId: number;

before(async () => {
  migrate();
  seedSources(getDb());
  eventId = processAnnouncement(getDb(), raw, { defaultCategory: 'lecture' }).id;
  otherEventId = processAnnouncement(
    getDb(),
    { ...raw, url: 'https://www.ntou.edu.tw/event/ratings-2' },
    { defaultCategory: 'lecture' },
  ).id;
  // 缺標題 → needs_review，不對外顯示
  reviewId = processAnnouncement(getDb(), {
    ...raw,
    url: 'https://www.ntou.edu.tw/event/ratings-3',
    title: null,
  }).id;
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  closeDb();
});

interface RatingBody {
  rating?: EventRatingSummary;
  error?: string;
  fields?: Record<string, string>;
}

async function request(
  method: string,
  path: string,
  options: { cookie?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as RatingBody };
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
  return cookie;
}

function rate(id: number, score: unknown, cookie?: string) {
  return request('PUT', `/api/events/${id}/ratings`, { cookie, body: { score } });
}

function countRows(id: number): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS count FROM event_ratings WHERE event_id = ?')
    .get(id);
  return Number(row?.count);
}

describe('活動評價（US-11）', () => {
  test('沒有評價時平均分數為 null、人數為 0', async () => {
    const { status, body } = await request('GET', `/api/events/${otherEventId}/ratings`);
    assert.equal(status, 200);
    assert.deepEqual(body.rating, { average: null, count: 0, myScore: null });
  });

  test('訪客不能評分', async () => {
    const { status, body } = await rate(eventId, 5);
    assert.equal(status, 401);
    assert.equal(body.error, 'unauthorized');
    assert.equal(countRows(eventId), 0);
  });

  test('評分後平均分數與人數正確更新', async () => {
    const alice = await registerUser('alice@example.com');
    const bob = await registerUser('bob@example.com');
    const carol = await registerUser('carol@example.com');

    assert.deepEqual((await rate(eventId, 5, alice)).body.rating, {
      average: 5,
      count: 1,
      myScore: 5,
    });
    assert.deepEqual((await rate(eventId, 4, bob)).body.rating, {
      average: 4.5,
      count: 2,
      myScore: 4,
    });
    // (5 + 4 + 4) / 3 = 4.333… → 4.3
    assert.deepEqual((await rate(eventId, 4, carol)).body.rating, {
      average: 4.3,
      count: 3,
      myScore: 4,
    });

    // 訪客看得到平均與人數，但沒有自己的評分
    const guest = await request('GET', `/api/events/${eventId}/ratings`);
    assert.equal(guest.status, 200);
    assert.deepEqual(guest.body.rating, { average: 4.3, count: 3, myScore: null });

    // 登入者會看到自己的評分
    const mine = await request('GET', `/api/events/${eventId}/ratings`, { cookie: bob });
    assert.equal(mine.body.rating?.myScore, 4);

    // 其他活動不受影響
    assert.equal(countRows(otherEventId), 0);
  });

  test('再次評分是修改而非新增', async () => {
    const dave = await registerUser('dave@example.com');
    await rate(otherEventId, 2, dave);
    const { status, body } = await rate(otherEventId, 5, dave);
    assert.equal(status, 200);
    assert.deepEqual(body.rating, { average: 5, count: 1, myScore: 5 });
    assert.equal(countRows(otherEventId), 1);
  });

  test('分數不是 1–5 的整數時被擋下', async () => {
    const erin = await registerUser('erin@example.com');
    for (const score of [0, 6, 3.5, '3', null, undefined, -1]) {
      const { status, body } = await rate(otherEventId, score, erin);
      assert.equal(status, 400, JSON.stringify(score));
      assert.equal(body.error, 'validation_error');
      assert.ok(body.fields?.score);
    }
  });

  test('不存在、待審或無效的活動回傳 404', async () => {
    const frank = await registerUser('frank@example.com');
    for (const id of ['999999', String(reviewId), 'abc']) {
      assert.equal((await request('GET', `/api/events/${id}/ratings`)).status, 404, id);
      const put = await request('PUT', `/api/events/${id}/ratings`, {
        cookie: frank,
        body: { score: 3 },
      });
      assert.equal(put.status, 404, id);
    }
  });
});
