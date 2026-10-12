import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../../app.js';
import { closeDb, getDb, migrate } from '../../db/index.js';
import { processAnnouncement } from './events.service.js';
import type { PublishedEvent, RawAnnouncement } from './events.types.js';

process.env.DATABASE_PATH = ':memory:';

const reference = '2026-10-01T09:00:00+08:00';
const raw: RawAnnouncement = {
  sourceId: 1,
  url: 'https://www.ntou.edu.tw/event/1',
  title: '海大講座',
  rawContent:
    '活動日期：2026/10/07 14:00-16:00\n地點：甲子廳\n主辦單位：國立臺灣海洋大學\n歡迎踴躍參加',
  publishedAt: reference,
  fetchedAt: reference,
};

let server: Server;
let baseUrl: string;
let publishedId: number;
let reviewId: number;

before(async () => {
  migrate();
  publishedId = processAnnouncement(getDb(), raw, { defaultCategory: 'lecture' }).id;
  // 缺標題 → needs_review
  reviewId = processAnnouncement(getDb(), {
    ...raw,
    url: 'https://www.ntou.edu.tw/event/2',
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

async function getEvent(eventId: string | number) {
  const response = await fetch(`${baseUrl}/api/events/${eventId}`);
  const body = (await response.json()) as {
    event?: PublishedEvent & { categoryLabel: string };
    error?: string;
  };
  return { status: response.status, body };
}

describe('GET /api/events/:eventId（US-02）', () => {
  test('未登入可取得已發布活動的詳細資訊', async () => {
    const { status, body } = await getEvent(publishedId);
    assert.equal(status, 200);
    const event = body.event;
    assert.ok(event);
    assert.equal(event.id, publishedId);
    assert.equal(event.status, 'published');
    assert.equal(event.title, '海大講座');
    assert.equal(event.category, 'lecture');
    assert.equal(event.categoryLabel, '講座');
    assert.equal(event.startTime, '2026-10-07T14:00:00+08:00');
    assert.equal(event.endTime, '2026-10-07T16:00:00+08:00');
    assert.equal(event.allDay, false);
    assert.equal(event.location, '甲子廳');
    assert.equal(event.organizer, '國立臺灣海洋大學');
    assert.match(event.description, /歡迎踴躍參加/);
    assert.equal(event.originalUrl, 'https://www.ntou.edu.tw/event/1');
    assert.deepEqual(event.tags, []);
  });

  test('不存在的活動回傳 404', async () => {
    const { status, body } = await getEvent(999999);
    assert.equal(status, 404);
    assert.equal(body.error, 'not_found');
  });

  test('待審（needs_review）活動不對外顯示，回傳 404', async () => {
    const { status, body } = await getEvent(reviewId);
    assert.equal(status, 404);
    assert.equal(body.error, 'not_found');
  });

  test('無效的活動 ID 回傳 404', async () => {
    for (const eventId of ['abc', '0', '-1', '1.5', '01', '99999999999999999999']) {
      const { status } = await getEvent(eventId);
      assert.equal(status, 404, eventId);
    }
  });
});
