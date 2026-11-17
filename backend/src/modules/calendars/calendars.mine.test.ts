import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../../app.js';
import { closeDb, getDb, migrate } from '../../db/index.js';
import { convertAnnouncement } from '../events/events.converter.js';
import { upsertEvent } from '../events/events.repository.js';
import type { EventCategory, RawAnnouncement } from '../events/events.types.js';

process.env.DATABASE_PATH = ':memory:';

let server: Server;
let baseUrl: string;
let nextUrl = 1;
/** 已核准的系網、已核准的社團、待審核的來源 */
const sources = { dept: 0, club: 0, pending: 0 };

const raw: RawAnnouncement = {
  sourceId: 1,
  url: 'https://example.com/event',
  title: '活動',
  rawContent: '活動日期：2099/05/01\n地點：體育館',
  publishedAt: '2099-04-01T09:00:00+08:00',
  fetchedAt: '2099-04-01T09:00:00+08:00',
};

/** 直接指定時間建立已發布活動，回傳 id */
function seedEvent(
  title: string,
  sourceId: number,
  category: EventCategory,
  startTime: string,
  endTime: string | null = null,
  allDay = false,
): number {
  const converted = convertAnnouncement(
    { ...raw, sourceId, url: `https://example.com/event/${nextUrl++}`, title },
    { defaultCategory: category },
  );
  const event = upsertEvent(getDb(), { ...converted, startTime, endTime, allDay });
  assert.equal(event.status, 'published', title);
  return event.id;
}

const ids: Record<string, number> = {};

before(async () => {
  migrate();
  const db = getDb();
  db.prepare(
    "INSERT INTO users (email, password_hash, display_name) VALUES ('owner@example.com', 'x', 'owner')",
  ).run();
  const insertSource = db.prepare(
    `INSERT INTO sources (name, url, type, review_status, submitted_by)
    VALUES (?, ?, ?, ?, 1) RETURNING id`,
  );
  sources.dept = Number(
    insertSource.get('海洋系', 'https://example.com/dept', 'department_site', 'approved')?.id,
  );
  sources.club = Number(
    insertSource.get('攝影社', 'https://example.com/club', 'club_site', 'approved')?.id,
  );
  sources.pending = Number(
    insertSource.get('待審社團', 'https://example.com/p', 'club_site', 'pending')?.id,
  );

  ids.lecture = seedEvent(
    '系上講座',
    sources.dept,
    'lecture',
    '2099-05-03T14:00:00+08:00',
    '2099-05-03T16:00:00+08:00',
  );
  ids.photo = seedEvent(
    '攝影展',
    sources.club,
    'exhibition',
    '2099-05-10T00:00:00+08:00',
    '2099-05-13T00:00:00+08:00',
    true,
  );
  ids.sports = seedEvent('系際盃', sources.dept, 'sports', '2099-05-20T09:00:00+08:00');
  ids.pending = seedEvent(
    '待審來源的活動',
    sources.pending,
    'lecture',
    '2099-05-05T10:00:00+08:00',
  );

  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  closeDb();
});

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
  const contentType = response.headers.get('content-type') ?? '';
  const text = await response.text();
  return {
    status: response.status,
    headers: response.headers,
    text,
    // eslint 不允許 any，回應內容以 unknown 讀取後在各測試轉型
    body: (contentType.includes('json') && text ? JSON.parse(text) : {}) as Record<string, unknown>,
  };
}

async function registerUser(email: string): Promise<string> {
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

interface Item {
  id: number;
  title: string;
  sourceName: string;
  categoryLabel: string;
  mine: boolean;
  mark: string | null;
  via: { category: boolean; source: boolean };
}

const MAY = 'from=2099-05-01&to=2099-05-31';

async function titles(query: string, cookie?: string): Promise<string[]> {
  const { status, body } = await request('GET', `/api/calendars/events?${query}`, { cookie });
  assert.equal(status, 200, query);
  return (body.items as Item[]).map((item) => item.title);
}

describe('GET /api/calendars/events（月曆）', () => {
  test('訪客可瀏覽所有活動，不含未核准來源的活動，且每筆都不屬於自己', async () => {
    const { body } = await request('GET', `/api/calendars/events?${MAY}`);
    const items = body.items as Item[];
    assert.deepEqual(
      items.map((item) => item.title),
      ['系上講座', '攝影展', '系際盃'],
    );
    assert.equal(items[1].sourceName, '攝影社');
    assert.equal(items[1].categoryLabel, '展覽');
    assert.ok(items.every((item) => !item.mine && item.mark === null));
  });

  test('可依類別與來源篩選，日期範圍與活動期間重疊就列出', async () => {
    assert.deepEqual(await titles(`${MAY}&category=sports`), ['系際盃']);
    assert.deepEqual(await titles(`${MAY}&sourceId=${sources.club}`), ['攝影展']);
    // 攝影展為 5/10～5/12（全天活動的 end_time 是隔天 00:00）
    assert.deepEqual(await titles('from=2099-05-12&to=2099-05-12'), ['攝影展']);
    assert.deepEqual(await titles('from=2099-05-13&to=2099-05-19'), []);
  });

  test('訪客查詢我的行事曆回傳 401', async () => {
    assert.equal((await request('GET', `/api/calendars/events?${MAY}&scope=mine`)).status, 401);
  });

  test('日期、範圍、類別、來源與 scope 不合法時回傳 400', async () => {
    for (const query of [
      'from=2099-05-01',
      'from=2099-02-30&to=2099-03-01',
      'from=2099-05-31&to=2099-05-01',
      'from=2099-01-01&to=2099-12-31',
      `${MAY}&category=unknown`,
      `${MAY}&sourceId=abc`,
      `${MAY}&scope=everything`,
    ]) {
      assert.equal((await request('GET', `/api/calendars/events?${query}`)).status, 400, query);
    }
  });
});

describe('我的行事曆：追蹤、加入與隱藏', () => {
  test('剛註冊時我的行事曆是空的', async () => {
    const cookie = await registerUser('empty@example.com');
    assert.deepEqual(await titles(`${MAY}&scope=mine`, cookie), []);
  });

  test('追蹤類別或來源的活動會出現在我的行事曆，並標示原因', async () => {
    const cookie = await registerUser('follow@example.com');
    await request('PUT', '/api/subscriptions/exhibition', { cookie });
    await request('PUT', `/api/subscriptions/sources/${sources.dept}`, { cookie });
    const { body } = await request('GET', `/api/calendars/events?${MAY}&scope=mine`, { cookie });
    const items = body.items as Item[];
    assert.deepEqual(
      items.map((item) => item.title),
      ['系上講座', '攝影展', '系際盃'],
    );
    assert.deepEqual(items[1].via, { category: true, source: false });
    assert.deepEqual(items[0].via, { category: false, source: true });
    assert.ok(items.every((item) => item.mine));
  });

  test('手動加入單一活動，移除標記後消失；重複加入結果相同', async () => {
    const cookie = await registerUser('add@example.com');
    const path = `/api/calendars/events/${ids.sports}/mark`;
    const added = await request('PUT', path, { cookie, body: { state: 'added' } });
    assert.equal(added.status, 200);
    assert.deepEqual(added.body, {
      mine: true,
      mark: 'added',
      via: { category: false, source: false },
    });
    await request('PUT', path, { cookie, body: { state: 'added' } });
    assert.deepEqual(await titles(`${MAY}&scope=mine`, cookie), ['系際盃']);
    assert.equal(
      getDb()
        .prepare('SELECT count(*) AS n FROM calendar_event_marks WHERE event_id = ?')
        .get(ids.sports)?.n,
      1,
    );

    const cleared = await request('DELETE', path, { cookie });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.mine, false);
    assert.deepEqual(await titles(`${MAY}&scope=mine`, cookie), []);
  });

  test('隱藏追蹤帶進來的活動；hidden=1 時列出以便還原，移除標記後恢復', async () => {
    const cookie = await registerUser('hide@example.com');
    await request('PUT', '/api/subscriptions/lecture', { cookie });
    const path = `/api/calendars/events/${ids.lecture}/mark`;
    const hidden = await request('PUT', path, { cookie, body: { state: 'hidden' } });
    assert.deepEqual(hidden.body, {
      mine: false,
      mark: 'hidden',
      via: { category: true, source: false },
    });
    assert.deepEqual(await titles(`${MAY}&scope=mine`, cookie), []);
    assert.deepEqual(await titles(`${MAY}&scope=mine&hidden=1`, cookie), ['系上講座']);

    await request('DELETE', path, { cookie });
    assert.deepEqual(await titles(`${MAY}&scope=mine`, cookie), ['系上講座']);
  });

  test('每個人的行事曆互不影響', async () => {
    const alice = await registerUser('alice-mine@example.com');
    const bob = await registerUser('bob-mine@example.com');
    await request('PUT', `/api/calendars/events/${ids.photo}/mark`, {
      cookie: alice,
      body: { state: 'added' },
    });
    assert.deepEqual(await titles(`${MAY}&scope=mine`, alice), ['攝影展']);
    assert.deepEqual(await titles(`${MAY}&scope=mine`, bob), []);
    const { body } = await request('GET', `/api/calendars/events?${MAY}`, { cookie: bob });
    assert.ok((body.items as Item[]).every((item) => !item.mine));
  });

  test('標記 API 需要登入，活動不存在或來源未核准回傳 404，state 不合法回傳 400', async () => {
    const path = `/api/calendars/events/${ids.lecture}/mark`;
    assert.equal((await request('GET', path)).status, 401);
    assert.equal((await request('PUT', path, { body: { state: 'added' } })).status, 401);
    const cookie = await registerUser('mark-invalid@example.com');
    for (const eventId of ['99999', 'abc', String(ids.pending)]) {
      const response = await request('PUT', `/api/calendars/events/${eventId}/mark`, {
        cookie,
        body: { state: 'added' },
      });
      assert.equal(response.status, 404, eventId);
    }
    for (const body of [{}, { state: 'deleted' }]) {
      assert.equal((await request('PUT', path, { cookie, body })).status, 400);
    }
  });

  test('GET 標記回傳活動與自己的關係', async () => {
    const cookie = await registerUser('mark-get@example.com');
    await request('PUT', '/api/subscriptions/sports', { cookie });
    const { status, body } = await request('GET', `/api/calendars/events/${ids.sports}/mark`, {
      cookie,
    });
    assert.equal(status, 200);
    assert.deepEqual(body, { mine: true, mark: null, via: { category: true, source: false } });
  });
});

describe('跨來源重複活動合併後（US-20）', () => {
  test('加入或追蹤的是被合併的那筆時，保留的活動仍在我的行事曆', async () => {
    const kept = seedEvent(
      '合併後保留的活動',
      sources.dept,
      'workshop',
      '2099-05-25T10:00:00+08:00',
    );
    const merged = seedEvent('被合併的活動', sources.club, 'workshop', '2099-05-25T10:00:00+08:00');
    const added = await registerUser('merged-added@example.com');
    const follower = await registerUser('merged-follow@example.com');
    await request('PUT', `/api/calendars/events/${merged}/mark`, {
      cookie: added,
      body: { state: 'added' },
    });
    await request('PUT', `/api/subscriptions/sources/${sources.club}`, { cookie: follower });

    getDb()
      .prepare("UPDATE events SET duplicate_of = ?, dedup_status = 'merged' WHERE id = ?")
      .run(kept, merged);

    const range = 'from=2099-05-25&to=2099-05-25&scope=mine';
    assert.deepEqual(await titles(range, added), ['合併後保留的活動']);
    assert.deepEqual(await titles(range, follower), ['合併後保留的活動']);

    // 在保留的活動上移除標記，也會清掉記在被合併活動上的舊標記
    await request('DELETE', `/api/calendars/events/${kept}/mark`, { cookie: added });
    assert.deepEqual(await titles(range, added), []);
  });
});

describe('同步網址（iCal）', () => {
  test('同步網址輸出我的行事曆，未登入的行事曆軟體也能讀取', async () => {
    const cookie = await registerUser('feed@example.com');
    await request('PUT', '/api/subscriptions/exhibition', { cookie });
    await request('PUT', `/api/calendars/events/${ids.sports}/mark`, {
      cookie,
      body: { state: 'added' },
    });
    const feed = await request('GET', '/api/calendars/feed', { cookie });
    assert.equal(feed.status, 200);
    const icsPath = String(feed.body.icsPath);
    assert.match(icsPath, /^\/api\/calendars\/feed\/[\w-]{20,}\.ics$/);
    // 同一位使用者再取一次網址不變
    assert.equal((await request('GET', '/api/calendars/feed', { cookie })).body.icsPath, icsPath);

    const ics = await request('GET', icsPath);
    assert.equal(ics.status, 200);
    assert.match(ics.headers.get('content-type') ?? '', /^text\/calendar/);
    assert.match(ics.text, /X-WR-CALNAME:EVENTOU 我的行事曆/);
    assert.ok(ics.text.includes(`UID:event-${ids.photo}@eventou`));
    assert.ok(ics.text.includes(`UID:event-${ids.sports}@eventou`));
    assert.ok(!ics.text.includes(`UID:event-${ids.lecture}@eventou`));
  });

  test('重設後舊網址失效，新網址可用', async () => {
    const cookie = await registerUser('feed-reset@example.com');
    const before = String((await request('GET', '/api/calendars/feed', { cookie })).body.icsPath);
    const reset = await request('POST', '/api/calendars/feed/reset', { cookie });
    assert.equal(reset.status, 200);
    const after = String(reset.body.icsPath);
    assert.notEqual(after, before);
    assert.equal((await request('GET', before)).status, 404);
    assert.equal((await request('GET', after)).status, 200);
  });

  test('取得與重設同步網址需要登入；不存在的 token 回傳 404', async () => {
    assert.equal((await request('GET', '/api/calendars/feed')).status, 401);
    assert.equal((await request('POST', '/api/calendars/feed/reset')).status, 401);
    assert.equal((await request('GET', '/api/calendars/feed/not-a-token.ics')).status, 404);
  });
});

describe('GET /api/calendars/events/:eventId.ics（單一活動下載）', () => {
  test('未登入可下載單一活動的 .ics，以附件形式回傳', async () => {
    const response = await request('GET', `/api/calendars/events/${ids.lecture}.ics`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition') ?? '', /^attachment;/);
    assert.ok(response.text.includes(`UID:event-${ids.lecture}@eventou`));
    assert.match(response.text, /SUMMARY:系上講座/);
  });

  test('活動不存在或來源未核准時回傳 404', async () => {
    for (const eventId of ['99999', String(ids.pending)]) {
      assert.equal((await request('GET', `/api/calendars/events/${eventId}.ics`)).status, 404);
    }
  });
});

describe('GET /api/calendars/sources', () => {
  test('只列出已核准的來源', async () => {
    const { body } = await request('GET', '/api/calendars/sources');
    const names = (body.sources as { name: string }[]).map((source) => source.name);
    assert.deepEqual(names, ['攝影社', '海洋系']);
  });
});
