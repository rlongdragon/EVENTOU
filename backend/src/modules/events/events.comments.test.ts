import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../../app.js';
import { closeDb, getDb, migrate } from '../../db/index.js';
import { seedSources } from '../sources/sources.testHelpers.js';
import { COMMENT_MAX_LENGTH, createEventComment, type EventComment } from './events.comments.js';
import { processAnnouncement } from './events.service.js';
import type { RawAnnouncement } from './events.types.js';

process.env.DATABASE_PATH = ':memory:';

const reference = '2026-10-01T09:00:00+08:00';
const raw: RawAnnouncement = {
  sourceId: 1,
  url: 'https://www.ntou.edu.tw/event/comments-1',
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
    { ...raw, url: 'https://www.ntou.edu.tw/event/comments-2' },
    { defaultCategory: 'lecture' },
  ).id;
  // 缺標題 → needs_review，不對外顯示
  reviewId = processAnnouncement(getDb(), {
    ...raw,
    url: 'https://www.ntou.edu.tw/event/comments-3',
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

interface CommentsBody {
  comments?: EventComment[];
  comment?: EventComment;
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
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as CommentsBody };
}

async function registerUser(email: string, displayName: string) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123', displayName }),
  });
  assert.equal(response.status, 201);
  const cookie = response.headers.getSetCookie()[0]?.split(';')[0];
  assert.ok(cookie);
  const { user } = (await response.json()) as { user: { id: number } };
  return { cookie, id: user.id };
}

function postComment(id: number, content: unknown, cookie?: string) {
  return request('POST', `/api/events/${id}/comments`, { cookie, body: { content } });
}

describe('活動留言（US-10）', () => {
  test('訪客可查看留言，沒有留言時回傳空陣列', async () => {
    const { status, body } = await request('GET', `/api/events/${otherEventId}/comments`);
    assert.equal(status, 200);
    assert.deepEqual(body.comments, []);
  });

  test('訪客不能留言', async () => {
    const { status, body } = await postComment(eventId, '訪客留言');
    assert.equal(status, 401);
    assert.equal(body.error, 'unauthorized');
  });

  test('登入後留言成功，回傳留言者與時間，內容去除前後空白', async () => {
    const { cookie, id } = await registerUser('alice@example.com', 'Alice');
    const { status, body } = await postComment(eventId, '  請問需要報名嗎？\n謝謝  ', cookie);
    assert.equal(status, 201);
    const comment = body.comment;
    assert.ok(comment);
    assert.equal(comment.content, '請問需要報名嗎？\n謝謝');
    assert.deepEqual(comment.author, { id, displayName: 'Alice' });
    assert.match(comment.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
    assert.equal('email' in comment.author, false);
  });

  test('留言依時間由舊到新排序，只列出該活動的留言', async () => {
    const { id: bobId } = await registerUser('bob@example.com', 'Bob');
    const db = getDb();
    // 直接指定時間寫入，確保排序與寫入順序無關
    createEventComment(
      db,
      { eventId: otherEventId, userId: bobId, content: '第二則' },
      new Date('2026-10-02T02:00:00Z'),
    );
    createEventComment(
      db,
      { eventId: otherEventId, userId: bobId, content: '第一則' },
      new Date('2026-10-02T01:00:00Z'),
    );
    const { status, body } = await request('GET', `/api/events/${otherEventId}/comments`);
    assert.equal(status, 200);
    assert.deepEqual(
      body.comments?.map((comment) => [comment.content, comment.createdAt]),
      [
        ['第一則', '2026-10-02T09:00:00+08:00'],
        ['第二則', '2026-10-02T10:00:00+08:00'],
      ],
    );
    assert.ok(body.comments?.every((comment) => comment.author.displayName === 'Bob'));
  });

  test('空白、非字串或過長的留言被擋下', async () => {
    const { cookie } = await registerUser('carol@example.com', 'Carol');
    for (const content of ['', '   ', '\n\t', undefined, 123, null]) {
      const { status, body } = await postComment(eventId, content, cookie);
      assert.equal(status, 400, JSON.stringify(content));
      assert.equal(body.error, 'validation_error');
      assert.equal(body.fields?.content, '請輸入留言內容');
    }
    const tooLong = await postComment(eventId, 'a'.repeat(COMMENT_MAX_LENGTH + 1), cookie);
    assert.equal(tooLong.status, 400);
    assert.match(tooLong.body.fields?.content ?? '', /不可超過/);
    const maxLength = await postComment(eventId, 'a'.repeat(COMMENT_MAX_LENGTH), cookie);
    assert.equal(maxLength.status, 201);
  });

  test('不存在、待審或無效的活動回傳 404', async () => {
    const { cookie } = await registerUser('dave@example.com', 'Dave');
    for (const id of ['999999', String(reviewId), 'abc']) {
      assert.equal((await request('GET', `/api/events/${id}/comments`)).status, 404, id);
      const posted = await request('POST', `/api/events/${id}/comments`, {
        cookie,
        body: { content: '留言' },
      });
      assert.equal(posted.status, 404, id);
    }
  });
});
