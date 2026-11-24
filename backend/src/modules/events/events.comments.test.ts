import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../../app.js';
import { closeDb, getDb, migrate } from '../../db/index.js';
import { createTestUser } from '../auth/auth.testHelpers.js';
import { seedSources } from '../sources/sources.testHelpers.js';
import {
  COMMENT_MAX_LENGTH,
  createEventComment,
  updateEventComment,
  type EventComment,
} from './events.comments.js';
import { createCommentReport, reviewCommentReports } from './events.reports.js';
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
  total?: number;
  likeCount?: number;
  likedByMe?: boolean;
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
    const { cookie, id } = createTestUser({ displayName: 'Alice' });
    const { status, body } = await postComment(eventId, '  請問需要報名嗎？\n謝謝  ', cookie);
    assert.equal(status, 201);
    const comment = body.comment;
    assert.ok(comment);
    assert.equal(comment.content, '請問需要報名嗎？\n謝謝');
    assert.deepEqual(comment.author, { id, displayName: 'Alice', role: 'user' });
    assert.match(comment.createdAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/);
    assert.equal('email' in comment.author, false);
  });

  test('留言依時間由舊到新排序，只列出該活動的留言', async () => {
    const { id: bobId } = createTestUser({ displayName: 'Bob' });
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
    assert.ok(body.comments?.every((comment) => comment.author?.displayName === 'Bob'));
  });

  test('空白、非字串或過長的留言被擋下', async () => {
    const { cookie } = createTestUser({ displayName: 'Carol' });
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

  test('留言附上留言者目前對該活動的評分，沒評分為 null，改分數後跟著更新', async () => {
    const erin = createTestUser({ displayName: 'Erin' });
    const frank = createTestUser({ displayName: 'Frank' });
    const rated = await postComment(otherEventId, '很推薦', erin.cookie);
    assert.equal(rated.body.comment?.rating, null);
    const rate = (score: number) =>
      request('PUT', `/api/events/${otherEventId}/ratings`, {
        cookie: erin.cookie,
        body: { score },
      });
    assert.equal((await rate(4)).status, 200);
    await postComment(otherEventId, '沒有評分', frank.cookie);
    // 在其他活動評分不影響這個活動的留言
    await request('PUT', `/api/events/${eventId}/ratings`, {
      cookie: frank.cookie,
      body: { score: 1 },
    });
    const ratingOf = async (name: string) => {
      const { body } = await request('GET', `/api/events/${otherEventId}/comments`);
      return body.comments?.find((comment) => comment.author?.displayName === name)?.rating;
    };
    assert.equal(await ratingOf('Erin'), 4);
    assert.equal(await ratingOf('Frank'), null);
    await rate(2);
    assert.equal(await ratingOf('Erin'), 2);
  });

  test('不存在、待審或無效的活動回傳 404', async () => {
    const { cookie } = createTestUser({ displayName: 'Dave' });
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

describe('留言編輯、刪除、按讚、回覆與排序（#79）', () => {
  let threadEventId: number;

  before(() => {
    threadEventId = processAnnouncement(
      getDb(),
      { ...raw, url: 'https://www.ntou.edu.tw/event/comments-thread' },
      { defaultCategory: 'lecture' },
    ).id;
  });

  const path = (suffix = '') => `/api/events/${threadEventId}/comments${suffix}`;
  const list = async (cookie?: string) => (await request('GET', path(), { cookie })).body;

  test('留言者可編輯自己的留言，記錄編輯時間；別人不能編輯', async () => {
    const owner = createTestUser({ displayName: 'EditOwner' });
    const other = createTestUser({ displayName: 'EditOther' });
    const posted = await postComment(threadEventId, '原本的內容', owner.cookie);
    const id = posted.body.comment?.id;
    assert.equal(posted.body.comment?.editedAt, null);

    const edit = (content: unknown, cookie?: string, commentId: unknown = id) =>
      request('PATCH', path(`/${commentId}`), { cookie, body: { content } });
    const edited = await edit('  改過的內容  ', owner.cookie);
    assert.equal(edited.status, 200);
    assert.equal(edited.body.comment?.content, '改過的內容');
    assert.match(edited.body.comment?.editedAt ?? '', /\+08:00$/);

    assert.equal((await edit('偷改', other.cookie)).status, 403);
    assert.equal((await edit('  ', owner.cookie)).status, 400);
    assert.equal((await edit('x')).status, 401);
    assert.equal((await edit('x', owner.cookie, 999999)).status, 404);
  });

  test('回覆掛在頂層留言下，回覆「回覆」也掛在同一則頂層留言', async () => {
    const alice = createTestUser({ displayName: 'ThreadAlice' });
    const bob = createTestUser({ displayName: 'ThreadBob' });
    const reply = (parentId: unknown, content: string, cookie: string) =>
      request('POST', path(), { cookie, body: { content, parentId } });
    const top = (await postComment(threadEventId, '有人要一起去嗎？', alice.cookie)).body.comment;
    assert.ok(top);
    const first = await reply(top.id, '我要！', bob.cookie);
    assert.equal(first.status, 201);
    assert.equal(first.body.comment?.parentId, top.id);
    const nested = await reply(first.body.comment?.id, '好，門口見', alice.cookie);
    assert.equal(nested.body.comment?.parentId, top.id);

    const body = await list();
    const thread = body.comments?.find((comment) => comment.id === top.id);
    assert.deepEqual(
      thread?.replies.map((comment) => comment.content),
      ['我要！', '好，門口見'],
    );
    // 回覆不會出現在頂層
    assert.ok(!body.comments?.some((comment) => comment.parentId !== null));

    for (const parentId of [999999, 'abc', 0, 1.5]) {
      assert.equal((await reply(parentId, '回覆', bob.cookie)).status, 404, String(parentId));
    }
    // 其他活動的留言不能當作上層留言
    const elsewhere = (await postComment(otherEventId, '別的活動', alice.cookie)).body.comment;
    assert.equal((await reply(elsewhere?.id, '回覆', bob.cookie)).status, 404);
  });

  test('按讚與取消讚可重複呼叫，訪客看得到讚數但不能按', async () => {
    const author = createTestUser({ displayName: 'LikeAuthor' });
    const fan = createTestUser({ displayName: 'LikeFan' });
    const id = (await postComment(threadEventId, '值得按讚', author.cookie)).body.comment?.id;

    for (let i = 0; i < 2; i += 1) {
      const liked = await request('PUT', path(`/${id}/like`), { cookie: fan.cookie });
      assert.equal(liked.status, 200);
      assert.equal(liked.body.likeCount, 1);
      assert.equal(liked.body.likedByMe, true);
    }
    const mine = (await list(fan.cookie)).comments?.find((comment) => comment.id === id);
    assert.equal(mine?.likeCount, 1);
    assert.equal(mine?.likedByMe, true);
    const guest = (await list()).comments?.find((comment) => comment.id === id);
    assert.equal(guest?.likeCount, 1);
    assert.equal(guest?.likedByMe, false);

    assert.equal((await request('PUT', path(`/${id}/like`))).status, 401);
    const unliked = await request('DELETE', path(`/${id}/like`), { cookie: fan.cookie });
    assert.equal(unliked.body.likeCount, 0);
    assert.equal(unliked.body.likedByMe, false);
    const missing = await request('PUT', path('/999999/like'), { cookie: fan.cookie });
    assert.equal(missing.status, 404);
  });

  test('排序：最舊（預設）、最新、最多讚', async () => {
    const db = getDb();
    const { id: userId } = createTestUser({ displayName: 'Sorter' });
    const sortEventId = processAnnouncement(
      db,
      { ...raw, url: 'https://www.ntou.edu.tw/event/comments-sort' },
      { defaultCategory: 'lecture' },
    ).id;
    const make = (content: string, at: string) =>
      createEventComment(db, { eventId: sortEventId, userId, content }, new Date(at)).id;
    make('早', '2026-10-02T01:00:00Z');
    const middle = make('中', '2026-10-02T02:00:00Z');
    make('晚', '2026-10-02T03:00:00Z');
    const fan = createTestUser({ displayName: 'SortFan' });
    await request('PUT', `/api/events/${sortEventId}/comments/${middle}/like`, {
      cookie: fan.cookie,
    });
    const order = async (query = '') =>
      (await request('GET', `/api/events/${sortEventId}/comments${query}`)).body.comments?.map(
        (comment) => comment.content,
      );
    assert.deepEqual(await order(), ['早', '中', '晚']);
    assert.deepEqual(await order('?sort=oldest'), ['早', '中', '晚']);
    assert.deepEqual(await order('?sort=newest'), ['晚', '中', '早']);
    // 讚數相同時較新的在前
    assert.deepEqual(await order('?sort=top'), ['中', '晚', '早']);
    assert.deepEqual(await order('?sort=bogus'), ['早', '中', '晚']);
  });

  test('刪除：沒有回覆的留言消失；有回覆的保留佔位，回覆照常顯示', async () => {
    const owner = createTestUser({ displayName: 'DeleteOwner' });
    const replier = createTestUser({ displayName: 'DeleteReplier' });
    const lone = (await postComment(threadEventId, '沒人回', owner.cookie)).body.comment?.id;
    const parent = (await postComment(threadEventId, '有人回', owner.cookie)).body.comment?.id;
    await request('POST', path(), {
      cookie: replier.cookie,
      body: { content: '回覆內容', parentId: parent },
    });
    const totalBefore = (await list()).total ?? 0;
    const remove = (commentId: unknown, cookie: string) =>
      request('DELETE', path(`/${commentId}`), { cookie });

    assert.equal((await remove(lone, replier.cookie)).status, 403);
    assert.equal((await remove(lone, owner.cookie)).status, 204);
    assert.equal((await remove(parent, owner.cookie)).status, 204);
    // 已刪除的留言不能再刪、編輯、按讚或回覆
    assert.equal((await remove(lone, owner.cookie)).status, 404);
    const edit = await request('PATCH', path(`/${parent}`), {
      cookie: owner.cookie,
      body: { content: '復活' },
    });
    assert.equal(edit.status, 404);
    const like = await request('PUT', path(`/${parent}/like`), { cookie: replier.cookie });
    assert.equal(like.status, 404);
    const replyToDeleted = await request('POST', path(), {
      cookie: replier.cookie,
      body: { content: '還能回嗎', parentId: parent },
    });
    assert.equal(replyToDeleted.status, 404);

    const body = await list();
    assert.equal(body.total, totalBefore - 2);
    assert.ok(!body.comments?.some((comment) => comment.id === lone));
    const placeholder = body.comments?.find((comment) => comment.id === parent);
    assert.equal(placeholder?.removed, true);
    assert.equal(placeholder?.content, null);
    assert.equal(placeholder?.author, null);
    assert.deepEqual(
      placeholder?.replies.map((comment) => comment.content),
      ['回覆內容'],
    );
  });

  test('管理員可刪除別人的留言（記為隱藏），待審檢舉一併結案', async () => {
    const author = createTestUser({ displayName: 'AdminTarget' });
    const reporter = createTestUser({ displayName: 'AdminReporter' });
    const admin = createTestUser({ displayName: 'CommentAdmin', role: 'admin' });
    const id = (await postComment(threadEventId, '違規留言', author.cookie)).body.comment?.id;
    const reported = await request('POST', path(`/${id}/reports`), {
      cookie: reporter.cookie,
      body: { reason: 'spam' },
    });
    assert.equal(reported.status, 201);

    assert.equal((await request('DELETE', path(`/${id}`), { cookie: admin.cookie })).status, 204);
    assert.ok(!(await list()).comments?.some((comment) => comment.id === id));
    const row = getDb()
      .prepare('SELECT hidden_by, deleted_at FROM event_comments WHERE id = ?')
      .get(Number(id));
    assert.equal(Number(row?.hidden_by), admin.id);
    assert.equal(row?.deleted_at, null);
    const pending = getDb()
      .prepare(
        "SELECT count(*) AS n FROM comment_reports WHERE comment_id = ? AND status = 'pending'",
      )
      .get(Number(id));
    assert.equal(Number(pending?.n), 0);
  });

  test('留言者自行刪除後，不再出現在檢舉審核清單，也不能再被檢舉', async () => {
    const author = createTestUser({ displayName: 'SelfDelete' });
    const reporter = createTestUser({ displayName: 'SelfReporter' });
    const admin = createTestUser({ displayName: 'SelfAdmin', role: 'admin' });
    const id = (await postComment(threadEventId, '會被刪', author.cookie)).body.comment?.id;
    await request('POST', path(`/${id}/reports`), {
      cookie: reporter.cookie,
      body: { reason: 'spam' },
    });
    await request('DELETE', path(`/${id}`), { cookie: author.cookie });
    const response = await fetch(`${baseUrl}/api/events/comment-reports`, {
      headers: { Cookie: admin.cookie },
    });
    const { reports } = (await response.json()) as { reports: { comment: { id: number } }[] };
    assert.ok(!reports.some((report) => report.comment.id === id));
    const again = await request('POST', path(`/${id}/reports`), {
      cookie: admin.cookie,
      body: { reason: 'spam' },
    });
    assert.equal(again.status, 404);
  });
});

describe('被檢舉的留言不能靠編輯躲過審核（#87）', () => {
  let reportEventId: number;

  before(() => {
    reportEventId = processAnnouncement(
      getDb(),
      { ...raw, url: 'https://www.ntou.edu.tw/event/comments-report-edit' },
      { defaultCategory: 'lecture' },
    ).id;
  });

  test('有待審檢舉時編輯回 409，內容不變；檢舉結案後可以編輯', async () => {
    const author = createTestUser({ displayName: 'ReviewAuthor' });
    const reporter = createTestUser({ displayName: 'ReviewReporter' });
    const admin = createTestUser({ displayName: 'ReviewAdmin', role: 'admin' });
    const id = (await postComment(reportEventId, '不當內容', author.cookie)).body.comment?.id;
    const reported = await request('POST', `/api/events/${reportEventId}/comments/${id}/reports`, {
      cookie: reporter.cookie,
      body: { reason: 'abusive' },
    });
    assert.equal(reported.status, 201);

    const edit = () =>
      request('PATCH', `/api/events/${reportEventId}/comments/${id}`, {
        cookie: author.cookie,
        body: { content: '無害內容' },
      });
    const blocked = await edit();
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error, 'under_review');
    const { body } = await request('GET', `/api/events/${reportEventId}/comments`);
    assert.equal(body.comments?.find((comment) => comment.id === id)?.content, '不當內容');

    const dismissed = await fetch(`${baseUrl}/api/events/comment-reports/${id}/dismiss`, {
      method: 'POST',
      headers: { Cookie: admin.cookie },
    });
    assert.equal(dismissed.status, 200);
    assert.equal((await edit()).status, 200);
  });

  test('檢舉被駁回後留言又被編輯，原檢舉人可以重新檢舉；沒編輯就不行', async () => {
    const db = getDb();
    const author = createTestUser({ displayName: 'ReopenAuthor' });
    const reporter = createTestUser({ displayName: 'ReopenReporter' });
    const admin = createTestUser({ displayName: 'ReopenAdmin' });
    const at = (time: string) => new Date(`2026-11-20T${time}+08:00`);
    const commentId = createEventComment(
      db,
      { eventId: reportEventId, userId: author.id, content: '不當內容' },
      at('10:00:00'),
    ).id;
    const report = (time: string) =>
      createCommentReport(
        db,
        { eventId: reportEventId, commentId, reporterId: reporter.id, reason: 'spam', note: null },
        at(time),
      );
    assert.deepEqual(report('10:01:00'), { ok: true });
    reviewCommentReports(
      db,
      { commentId, action: 'dismiss', reviewerId: admin.id },
      at('10:02:00'),
    );
    // 結案後沒有編輯：不能重複檢舉
    assert.deepEqual(report('10:03:00'), { ok: false, error: 'already_reported' });

    const edited = updateEventComment(
      db,
      { eventId: reportEventId, commentId, userId: author.id, content: '又改回不當內容' },
      at('10:04:00'),
    );
    assert.equal(edited.ok, true);
    assert.deepEqual(report('10:05:00'), { ok: true });
    const row = db
      .prepare('SELECT status, reviewed_by, reviewed_at FROM comment_reports WHERE comment_id = ?')
      .get(commentId);
    assert.equal(row?.status, 'pending');
    assert.equal(row?.reviewed_by, null);
    assert.equal(row?.reviewed_at, null);
    // 重新變成待審後又不能編輯，也不能再重複檢舉
    const again = updateEventComment(
      db,
      { eventId: reportEventId, commentId, userId: author.id, content: '再改' },
      at('10:06:00'),
    );
    assert.deepEqual(again, { ok: false, error: 'under_review' });
    assert.deepEqual(report('10:07:00'), { ok: false, error: 'already_reported' });
  });

  test('結案前就編輯過（例如被檢舉前）的留言，駁回後不能重新檢舉', async () => {
    const db = getDb();
    const author = createTestUser({ displayName: 'EarlyAuthor' });
    const reporter = createTestUser({ displayName: 'EarlyReporter' });
    const admin = createTestUser({ displayName: 'EarlyAdmin' });
    const at = (time: string) => new Date(`2026-11-21T${time}+08:00`);
    const commentId = createEventComment(
      db,
      { eventId: reportEventId, userId: author.id, content: '原文' },
      at('09:00:00'),
    ).id;
    updateEventComment(
      db,
      { eventId: reportEventId, commentId, userId: author.id, content: '改過' },
      at('09:01:00'),
    );
    const report = (time: string) =>
      createCommentReport(
        db,
        { eventId: reportEventId, commentId, reporterId: reporter.id, reason: 'spam', note: null },
        at(time),
      );
    assert.deepEqual(report('09:02:00'), { ok: true });
    reviewCommentReports(
      db,
      { commentId, action: 'dismiss', reviewerId: admin.id },
      at('09:03:00'),
    );
    assert.deepEqual(report('09:04:00'), { ok: false, error: 'already_reported' });
  });
});
