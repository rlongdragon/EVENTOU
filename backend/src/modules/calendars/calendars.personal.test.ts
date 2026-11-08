import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../../app.js';
import { closeDb, getDb, migrate } from '../../db/index.js';
import { processAnnouncement } from '../events/events.service.js';
import type { EventCategory, RawAnnouncement } from '../events/events.types.js';
import { seedSources } from '../sources/sources.testHelpers.js';
import { MAX_CALENDARS_PER_USER, type PersonalCalendar } from './calendars.personal.js';

process.env.DATABASE_PATH = ':memory:';

const reference = '2026-10-01T09:00:00+08:00';
let nextUrl = 1;

function createEvent(
  title: string,
  category: EventCategory,
  tags: string[],
  overrides: Partial<RawAnnouncement> = {},
) {
  return processAnnouncement(
    getDb(),
    {
      sourceId: 1,
      url: `https://www.ntou.edu.tw/event/personal-${nextUrl++}`,
      title,
      rawContent: '活動日期：2026/10/07 14:00-16:00\n地點：甲子廳',
      publishedAt: reference,
      fetchedAt: reference,
      ...overrides,
    },
    { defaultCategory: category, tags },
  );
}

let server: Server;
let baseUrl: string;
let aiLecture: number;
let aiWorkshop: number;
let plainLecture: number;
let alice: string;
let bob: string;

interface Body {
  calendar?: PersonalCalendar;
  calendars?: PersonalCalendar[];
  events?: { id: number; title: string }[];
  tags?: string[];
  error?: string;
  fields?: Record<string, string>;
}

async function request(method: string, path: string, cookie?: string, body?: unknown) {
  const headers: Record<string, string> = {};
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const isJson = response.headers.get('content-type')?.includes('application/json');
  return {
    status: response.status,
    headers: response.headers,
    text,
    body: (isJson && text ? JSON.parse(text) : {}) as Body,
  };
}

async function register(email: string): Promise<string> {
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

async function createCalendar(cookie: string, body: unknown) {
  const result = await request('POST', '/api/calendars/personal', cookie, body);
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.ok(result.body.calendar);
  return result.body.calendar;
}

async function eventTitles(cookie: string, calendarId: number) {
  const result = await request('GET', `/api/calendars/personal/${calendarId}`, cookie);
  assert.equal(result.status, 200);
  return result.body.events?.map((event) => event.title);
}

before(async () => {
  migrate();
  const db = getDb();
  seedSources(db, 2); // 來源 1 核准、來源 2 維持待審核
  db.prepare("UPDATE sources SET review_status = 'approved' WHERE id = 1").run();
  aiLecture = createEvent('AI 講座', 'lecture', ['AI', '資工系']).id;
  aiWorkshop = createEvent('AI 工作坊', 'workshop', ['ＡＩ']).id; // 全形會正規化成 AI
  plainLecture = createEvent('海洋講座', 'lecture', ['海洋']).id;
  createEvent('運動會', 'sports', []);
  // 待審（缺標題）與未核准來源的活動都不輸出
  createEvent('', 'lecture', ['AI'], { title: null });
  createEvent('未核准來源的 AI 講座', 'lecture', ['AI'], { sourceId: 2 });
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  alice = await register('alice@example.com');
  bob = await register('bob@example.com');
});

after(() => {
  server.close();
  closeDb();
});

describe('個人行事曆（US-09）', () => {
  test('訪客不能建立或查看個人行事曆', async () => {
    assert.equal((await request('GET', '/api/calendars/personal')).status, 401);
    const created = await request('POST', '/api/calendars/personal', undefined, {
      name: 'AI',
      categories: ['lecture'],
    });
    assert.equal(created.status, 401);
  });

  test('可列出活動中出現過的標籤，不含待審或未核准來源的活動', async () => {
    const { status, body } = await request('GET', '/api/calendars/tags');
    assert.equal(status, 200);
    assert.deepEqual(body.tags, ['AI', '海洋', '資工系']);
  });

  test('依類別與標籤的組合篩選：同一項內任一符合，類別與標籤要同時符合', async () => {
    const byCategory = await createCalendar(alice, { name: '講座', categories: ['lecture'] });
    assert.deepEqual(await eventTitles(alice, byCategory.id), ['AI 講座', '海洋講座']);

    const byTag = await createCalendar(alice, { name: 'AI', tags: ['AI'] });
    assert.deepEqual(await eventTitles(alice, byTag.id), ['AI 講座', 'AI 工作坊']);

    const multi = await createCalendar(alice, {
      name: '多個類別',
      categories: ['workshop', 'sports'],
    });
    assert.deepEqual(await eventTitles(alice, multi.id), ['AI 工作坊', '運動會']);

    const both = await createCalendar(alice, {
      name: 'AI 講座',
      categories: ['lecture'],
      tags: ['AI', '不存在的標籤'],
    });
    assert.deepEqual(both.categories, ['lecture']);
    assert.deepEqual(both.tags, ['AI', '不存在的標籤']);
    assert.deepEqual(await eventTitles(alice, both.id), ['AI 講座']);
  });

  test('沒有符合條件的活動時回傳空陣列', async () => {
    const empty = await createCalendar(alice, { name: '沒有活動', tags: ['不存在的標籤'] });
    assert.deepEqual(await eventTitles(alice, empty.id), []);
  });

  test('新活動符合條件時會出現在行事曆，iCal 也會更新', async () => {
    const calendar = await createCalendar(alice, { name: '展覽', categories: ['exhibition'] });
    assert.deepEqual(await eventTitles(alice, calendar.id), []);
    const before = await request('GET', calendar.icsPath);
    assert.ok(!before.text.includes('BEGIN:VEVENT'));

    createEvent('海洋攝影展', 'exhibition', []);
    assert.deepEqual(await eventTitles(alice, calendar.id), ['海洋攝影展']);
    const afterEvent = await request('GET', calendar.icsPath);
    assert.ok(afterEvent.text.includes('SUMMARY:海洋攝影展'));
  });

  test('可以修改名稱與條件，訂閱網址不變', async () => {
    const calendar = await createCalendar(alice, { name: '講座', categories: ['lecture'] });
    const updated = await request('PUT', `/api/calendars/personal/${calendar.id}`, alice, {
      name: ' 海洋相關 ',
      tags: ['海洋'],
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.calendar?.name, '海洋相關');
    assert.deepEqual(updated.body.calendar?.categories, []);
    assert.equal(updated.body.calendar?.icsPath, calendar.icsPath);
    assert.deepEqual(await eventTitles(alice, calendar.id), ['海洋講座']);
  });

  test('刪除後行事曆與訂閱網址都失效', async () => {
    const calendar = await createCalendar(alice, { name: '暫時的', categories: ['sports'] });
    const deleted = await request('DELETE', `/api/calendars/personal/${calendar.id}`, alice);
    assert.equal(deleted.status, 204);
    assert.equal(
      (await request('GET', `/api/calendars/personal/${calendar.id}`, alice)).status,
      404,
    );
    assert.equal((await request('GET', calendar.icsPath)).status, 404);
    const list = await request('GET', '/api/calendars/personal', alice);
    assert.ok(!list.body.calendars?.some((item) => item.id === calendar.id));
  });

  test('只能查看與管理自己的行事曆', async () => {
    const calendar = await createCalendar(alice, { name: 'Alice 的', categories: ['lecture'] });
    const path = `/api/calendars/personal/${calendar.id}`;
    assert.equal((await request('GET', path, bob)).status, 404);
    assert.equal(
      (await request('PUT', path, bob, { name: '改掉', categories: ['sports'] })).status,
      404,
    );
    assert.equal((await request('DELETE', path, bob)).status, 404);
    const bobList = await request('GET', '/api/calendars/personal', bob);
    assert.deepEqual(bobList.body.calendars, []);
    // 原本的行事曆沒有被改動
    const own = await request('GET', path, alice);
    assert.equal(own.body.calendar?.name, 'Alice 的');
  });

  test('iCal 訂閱以 token 識別，不需登入，只含符合條件的活動', async () => {
    const calendar = await createCalendar(alice, { name: 'AI', tags: ['AI'] });
    assert.match(calendar.icsPath, /^\/api\/calendars\/personal\/[\w-]{32}\.ics$/);
    const ics = await request('GET', calendar.icsPath);
    assert.equal(ics.status, 200);
    assert.match(ics.headers.get('content-type') ?? '', /^text\/calendar/);
    assert.equal(ics.headers.get('cache-control'), 'private, max-age=300');
    assert.ok(ics.text.includes('X-WR-CALNAME:EVENTOU AI'));
    assert.ok(ics.text.includes(`UID:event-${aiLecture}@eventou`));
    assert.ok(ics.text.includes(`UID:event-${aiWorkshop}@eventou`));
    assert.ok(!ics.text.includes(`UID:event-${plainLecture}@eventou`));
    assert.equal((await request('GET', '/api/calendars/personal/not-a-token.ics')).status, 404);
  });

  test('名稱、類別與標籤會驗證，且至少要有一個條件', async () => {
    const cases: [unknown, string][] = [
      [{ name: '', categories: ['lecture'] }, 'name'],
      [{ name: 'a'.repeat(51), categories: ['lecture'] }, 'name'],
      [{ name: '無條件' }, 'categories'],
      [{ name: '空條件', categories: [], tags: ['  '] }, 'categories'],
      [{ name: '錯的類別', categories: ['party'] }, 'categories'],
      [{ name: '錯的標籤', tags: [1] }, 'tags'],
      [{ name: '太長的標籤', tags: ['a'.repeat(31)] }, 'tags'],
    ];
    for (const [body, field] of cases) {
      const result = await request('POST', '/api/calendars/personal', alice, body);
      assert.equal(result.status, 400, JSON.stringify(body));
      assert.equal(result.body.error, 'validation_error');
      assert.ok(result.body.fields?.[field], JSON.stringify(body));
    }
    const invalidId = await request('PUT', '/api/calendars/personal/abc', alice, {
      name: 'x',
      categories: ['lecture'],
    });
    assert.equal(invalidId.status, 404);
  });

  test(`每位使用者最多 ${MAX_CALENDARS_PER_USER} 個行事曆`, async () => {
    const carol = await register('carol@example.com');
    for (let i = 0; i < MAX_CALENDARS_PER_USER; i += 1) {
      await createCalendar(carol, { name: `行事曆 ${i}`, categories: ['lecture'] });
    }
    const over = await request('POST', '/api/calendars/personal', carol, {
      name: '超過',
      categories: ['lecture'],
    });
    assert.equal(over.status, 409);
    assert.equal(over.body.error, 'limit_reached');
  });

  test('刪除使用者時一併刪除行事曆與條件', async () => {
    const db = getDb();
    const userId = Number(
      db
        .prepare("INSERT INTO users (email, password_hash, display_name) VALUES ('d@x', 'x', 'd')")
        .run().lastInsertRowid,
    );
    db.prepare(
      "INSERT INTO personal_calendars (user_id, name, token, created_at, updated_at) VALUES (?, 'x', 'tok-d', '', '')",
    ).run(userId);
    const calendarId = Number(
      db.prepare("SELECT id FROM personal_calendars WHERE token = 'tok-d'").get()?.id,
    );
    db.prepare(
      "INSERT INTO personal_calendar_categories (calendar_id, category) VALUES (?, 'lecture')",
    ).run(calendarId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    assert.equal(
      db
        .prepare('SELECT COUNT(*) AS n FROM personal_calendar_categories WHERE calendar_id = ?')
        .get(calendarId)?.n,
      0,
    );
  });
});
