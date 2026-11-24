import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../../app.js';
import { closeDb, getDb, migrate } from '../../db/index.js';
import { createTestUser } from '../auth/auth.testHelpers.js';
import { seedSources } from '../sources/sources.testHelpers.js';
import { processAnnouncement } from './events.service.js';
import type { RawAnnouncement } from './events.types.js';

process.env.DATABASE_PATH = ':memory:';

const reference = '2026-10-01T09:00:00+08:00';
const raw: RawAnnouncement = {
  sourceId: 1,
  url: 'https://www.ntou.edu.tw/event/reports-1',
  title: '海大講座',
  rawContent: '活動日期：2026/10/07 14:00-16:00\n地點：甲子廳\n主辦單位：國立臺灣海洋大學',
  publishedAt: reference,
  fetchedAt: reference,
};

let server: Server;
let baseUrl: string;
let eventId: number;
let otherEventId: number;

before(async () => {
  migrate();
  seedSources(getDb());
  eventId = processAnnouncement(getDb(), raw, { defaultCategory: 'lecture' }).id;
  otherEventId = processAnnouncement(
    getDb(),
    { ...raw, url: 'https://www.ntou.edu.tw/event/reports-2' },
    { defaultCategory: 'lecture' },
  ).id;
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  closeDb();
});

interface Body {
  comment?: { id: number };
  comments?: { id: number; content: string }[];
  reports?: {
    comment: { id: number; content: string; author: { displayName: string } };
    event: { id: number; title: string };
    reportCount: number;
    reasons: Record<string, number>;
    notes: string[];
  }[];
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
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as Body };
}

async function postComment(id: number, content: string, cookie: string) {
  const { status, body } = await request('POST', `/api/events/${id}/comments`, {
    cookie,
    body: { content },
  });
  assert.equal(status, 201);
  assert.ok(body.comment);
  return body.comment.id;
}

function report(id: number, commentId: number, body: unknown, cookie?: string) {
  return request('POST', `/api/events/${id}/comments/${commentId}/reports`, { cookie, body });
}

describe('留言檢舉（#65）', () => {
  test('登入後可以檢舉別人的留言；訪客、自己的留言、重複檢舉都被擋下', async () => {
    const author = createTestUser({ displayName: '作者' });
    const reporter = createTestUser({ displayName: '檢舉者' });
    const commentId = await postComment(eventId, '廣告訊息', author.cookie);

    assert.equal((await report(eventId, commentId, { reason: 'spam' })).status, 401);
    const own = await report(eventId, commentId, { reason: 'spam' }, author.cookie);
    assert.equal(own.status, 400);
    assert.equal(own.body.error, 'own_comment');

    const first = await report(
      eventId,
      commentId,
      { reason: 'spam', note: '  一直貼連結  ' },
      reporter.cookie,
    );
    assert.equal(first.status, 201);
    const again = await report(eventId, commentId, { reason: 'abusive' }, reporter.cookie);
    assert.equal(again.status, 409);
    assert.equal(again.body.error, 'already_reported');
  });

  test('原因與補充說明需驗證；留言不存在或不屬於該活動回 404', async () => {
    const author = createTestUser({ displayName: '作者二' });
    const reporter = createTestUser({ displayName: '檢舉者二' });
    const commentId = await postComment(eventId, '留言', author.cookie);

    for (const body of [{}, { reason: 'unknown' }, { reason: 123 }]) {
      const { status, body: response } = await report(eventId, commentId, body, reporter.cookie);
      assert.equal(status, 400, JSON.stringify(body));
      assert.equal(response.fields?.reason, '請選擇檢舉原因');
    }
    const tooLong = await report(
      eventId,
      commentId,
      { reason: 'other', note: 'a'.repeat(501) },
      reporter.cookie,
    );
    assert.equal(tooLong.status, 400);
    assert.match(tooLong.body.fields?.note ?? '', /不可超過/);

    assert.equal((await report(eventId, 999999, { reason: 'spam' }, reporter.cookie)).status, 404);
    assert.equal(
      (await report(otherEventId, commentId, { reason: 'spam' }, reporter.cookie)).status,
      404,
    );
  });

  test('只有管理員能看檢舉清單；同一則留言的檢舉合併顯示次數與原因', async () => {
    const author = createTestUser({ displayName: '作者三' });
    const a = createTestUser({ displayName: 'A' });
    const b = createTestUser({ displayName: 'B' });
    const admin = createTestUser({ displayName: '管理員', role: 'admin' });
    const commentId = await postComment(otherEventId, '不當言論', author.cookie);
    await report(otherEventId, commentId, { reason: 'abusive', note: '人身攻擊' }, a.cookie);
    await report(otherEventId, commentId, { reason: 'abusive' }, b.cookie);

    assert.equal((await request('GET', '/api/events/comment-reports')).status, 401);
    assert.equal(
      (await request('GET', '/api/events/comment-reports', { cookie: a.cookie })).status,
      403,
    );
    const { status, body } = await request('GET', '/api/events/comment-reports', {
      cookie: admin.cookie,
    });
    assert.equal(status, 200);
    const item = body.reports?.find((entry) => entry.comment.id === commentId);
    assert.ok(item);
    assert.equal(item.reportCount, 2);
    assert.deepEqual(item.reasons, { abusive: 2 });
    assert.deepEqual(item.notes, ['人身攻擊']);
    assert.equal(item.comment.author.displayName, '作者三');
    assert.equal(item.event.id, otherEventId);
  });

  test('隱藏留言後不再出現在留言列表，同則留言的檢舉一併結案，也不能再被檢舉', async () => {
    const author = createTestUser({ displayName: '作者四' });
    const reporter = createTestUser({ displayName: '檢舉者四' });
    const late = createTestUser({ displayName: '晚到的' });
    const admin = createTestUser({ displayName: '管理員', role: 'admin' });
    const commentId = await postComment(eventId, '要被隱藏的留言', author.cookie);
    await report(eventId, commentId, { reason: 'spam' }, reporter.cookie);

    const forbidden = await request('POST', `/api/events/comment-reports/${commentId}/hide`, {
      cookie: reporter.cookie,
    });
    assert.equal(forbidden.status, 403);
    const hidden = await request('POST', `/api/events/comment-reports/${commentId}/hide`, {
      cookie: admin.cookie,
    });
    assert.equal(hidden.status, 200);
    assert.equal(
      hidden.body.reports?.some((entry) => entry.comment.id === commentId),
      false,
    );

    const { body } = await request('GET', `/api/events/${eventId}/comments`);
    assert.equal(
      body.comments?.some((comment) => comment.id === commentId),
      false,
    );
    assert.equal((await report(eventId, commentId, { reason: 'spam' }, late.cookie)).status, 404);
    const again = await request('POST', `/api/events/comment-reports/${commentId}/hide`, {
      cookie: admin.cookie,
    });
    assert.equal(again.status, 404);
  });

  test('駁回後留言照常顯示，檢舉從清單移除；不支援的動作回 404', async () => {
    const author = createTestUser({ displayName: '作者五' });
    const reporter = createTestUser({ displayName: '檢舉者五' });
    const admin = createTestUser({ displayName: '管理員', role: 'admin' });
    const commentId = await postComment(eventId, '其實沒問題的留言', author.cookie);
    await report(eventId, commentId, { reason: 'other' }, reporter.cookie);

    const unknown = await request('POST', `/api/events/comment-reports/${commentId}/delete`, {
      cookie: admin.cookie,
    });
    assert.equal(unknown.status, 404);
    const dismissed = await request('POST', `/api/events/comment-reports/${commentId}/dismiss`, {
      cookie: admin.cookie,
    });
    assert.equal(dismissed.status, 200);
    assert.equal(
      dismissed.body.reports?.some((entry) => entry.comment.id === commentId),
      false,
    );
    const { body } = await request('GET', `/api/events/${eventId}/comments`);
    assert.ok(body.comments?.some((comment) => comment.id === commentId));
  });
});
