import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../../app.js';
import { closeDb, getDb, migrate } from '../../db/index.js';
import { processAnnouncement } from '../events/events.service.js';
import { EVENT_CATEGORIES } from '../events/events.types.js';
import type { RawAnnouncement } from '../events/events.types.js';
import { seedSources } from '../sources/sources.testHelpers.js';
import type { CalendarEvent } from './calendars.ics.js';
import { buildCalendar } from './calendars.ics.js';

process.env.DATABASE_PATH = ':memory:';

const reference = '2026-10-01T09:00:00+08:00';
const savedAt = new Date('2026-10-01T01:00:00Z');
const raw: RawAnnouncement = {
  sourceId: 1,
  url: 'https://www.ntou.edu.tw/event/1',
  title: '海大講座',
  rawContent: '活動日期：2026/10/07 14:00-16:00\n地點：甲子廳\n主辦單位：國立臺灣海洋大學',
  publishedAt: reference,
  fetchedAt: reference,
};

let server: Server;
let baseUrl: string;
let timedId: number;
let allDayId: number;

before(async () => {
  migrate();
  const db = getDb();
  seedSources(db, 2); // 來源 1 核准、來源 2 維持待審核
  db.prepare("UPDATE sources SET review_status = 'approved' WHERE id = 1").run();
  timedId = processAnnouncement(db, raw, { defaultCategory: 'lecture' }, savedAt).id;
  allDayId = processAnnouncement(
    db,
    {
      ...raw,
      url: 'https://www.ntou.edu.tw/event/2',
      title: '海洋科學系列講座',
      rawContent: '活動日期：2026/10/12-10/14',
    },
    { defaultCategory: 'lecture' },
    savedAt,
  ).id;
  // 缺標題 → needs_review，不對外輸出
  processAnnouncement(db, { ...raw, url: 'https://www.ntou.edu.tw/event/3', title: null });
  // 來源尚未核准
  processAnnouncement(
    db,
    { ...raw, sourceId: 2, url: 'https://example.com/event/4', title: '未核准來源的講座' },
    { defaultCategory: 'lecture' },
  );
  // 其他類別
  processAnnouncement(
    db,
    { ...raw, url: 'https://www.ntou.edu.tw/event/5', title: '程式設計工作坊' },
    { defaultCategory: 'workshop' },
  );
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  closeDb();
});

/** 還原折行後的內容行。 */
function unfold(ics: string): string[] {
  return ics
    .replace(/\r\n[ \t]/g, '')
    .split('\r\n')
    .filter(Boolean);
}

/** 把每個 VEVENT 拆成「屬性名稱（含參數）→ 值」。 */
function parseEvents(ics: string): Map<string, string>[] {
  const events: Map<string, string>[] = [];
  let current: Map<string, string> | null = null;
  for (const line of unfold(ics)) {
    if (line === 'BEGIN:VEVENT') current = new Map();
    else if (line === 'END:VEVENT' && current) {
      events.push(current);
      current = null;
    } else if (current) {
      const separator = line.indexOf(':');
      current.set(line.slice(0, separator), line.slice(separator + 1));
    }
  }
  return events;
}

async function getCalendar(category: string) {
  const response = await fetch(`${baseUrl}/api/calendars/categories/${category}.ics`);
  return { response, body: await response.text() };
}

function assertValidCalendar(ics: string) {
  assert.ok(ics.endsWith('\r\n'));
  assert.ok(!/(?<!\r)\n/.test(ics), '換行必須是 CRLF');
  for (const line of ics.split('\r\n')) {
    assert.ok(Buffer.byteLength(line) <= 75, `超過 75 位元組：${line}`);
  }
  const lines = unfold(ics);
  assert.equal(lines[0], 'BEGIN:VCALENDAR');
  assert.equal(lines.at(-1), 'END:VCALENDAR');
  assert.ok(lines.includes('VERSION:2.0'));
  assert.ok(lines.some((line) => line.startsWith('PRODID:')));
  assert.equal(
    lines.filter((line) => line === 'BEGIN:VEVENT').length,
    lines.filter((line) => line === 'END:VEVENT').length,
  );
  for (const event of parseEvents(ics)) {
    assert.ok(event.get('UID'));
    assert.match(event.get('DTSTAMP') ?? '', /^\d{8}T\d{6}Z$/);
    assert.ok(event.has('DTSTART') || event.has('DTSTART;VALUE=DATE'));
  }
}

describe('GET /api/calendars/categories/:category.ics（US-05）', () => {
  test('每個類別都有未登入可存取的 text/calendar 訂閱網址', async () => {
    for (const category of EVENT_CATEGORIES) {
      const { response, body } = await getCalendar(category);
      assert.equal(response.status, 200, category);
      assert.equal(response.headers.get('content-type'), 'text/calendar; charset=utf-8');
      assertValidCalendar(body);
    }
  });

  test('活動包含標題、開始／結束時間、地點、連結與 UID', async () => {
    const { body } = await getCalendar('lecture');
    assert.ok(unfold(body).includes('X-WR-CALNAME:EVENTOU 講座'));
    const event = parseEvents(body).find((item) => item.get('UID') === `event-${timedId}@eventou`);
    assert.ok(event);
    assert.equal(event.get('SUMMARY'), '海大講座');
    // 14:00–16:00（+08:00）以 UTC 輸出
    assert.equal(event.get('DTSTART'), '20261007T060000Z');
    assert.equal(event.get('DTEND'), '20261007T080000Z');
    assert.equal(event.get('LOCATION'), '甲子廳');
    assert.equal(event.get('URL'), 'https://www.ntou.edu.tw/event/1');
    assert.match(
      event.get('DESCRIPTION') ?? '',
      /原始公告：https:\/\/www\.ntou\.edu\.tw\/event\/1/,
    );
    assert.equal(event.get('LAST-MODIFIED'), '20261001T010000Z');
  });

  test('全天活動以 DATE 輸出，結束日為排他的隔天', async () => {
    const { body } = await getCalendar('lecture');
    const event = parseEvents(body).find((item) => item.get('UID') === `event-${allDayId}@eventou`);
    assert.ok(event);
    assert.equal(event.get('DTSTART;VALUE=DATE'), '20261012');
    assert.equal(event.get('DTEND;VALUE=DATE'), '20261015');
  });

  test('只包含該類別、已發布且來源已核准的活動', async () => {
    const { body } = await getCalendar('lecture');
    const titles = parseEvents(body).map((event) => event.get('SUMMARY'));
    assert.deepEqual(titles, ['海大講座', '海洋科學系列講座']);
  });

  test('類別沒有活動時回傳合法的空行事曆', async () => {
    const { response, body } = await getCalendar('exhibition');
    assert.equal(response.status, 200);
    assertValidCalendar(body);
    assert.deepEqual(parseEvents(body), []);
  });

  test('不存在的類別回傳 404', async () => {
    for (const category of ['unknown', 'LECTURE', 'lecture.ics', '%20']) {
      const { response } = await getCalendar(category);
      assert.equal(response.status, 404, category);
    }
    const response = await fetch(`${baseUrl}/api/calendars/categories/lecture`);
    assert.equal(response.status, 404);
  });

  test('活動更新後 UID 不變，內容與修改時間跟著更新', async () => {
    processAnnouncement(
      getDb(),
      { ...raw, rawContent: '活動日期：2026/10/08 10:00-12:00\n地點：第一演講廳' },
      { defaultCategory: 'lecture' },
      new Date('2026-10-02T03:00:00Z'),
    );
    const { body } = await getCalendar('lecture');
    const events = parseEvents(body);
    assert.equal(events.length, 2);
    const event = events.find((item) => item.get('UID') === `event-${timedId}@eventou`);
    assert.ok(event);
    assert.equal(event.get('DTSTART'), '20261008T020000Z');
    assert.equal(event.get('DTEND'), '20261008T040000Z');
    assert.equal(event.get('LOCATION'), '第一演講廳');
    assert.equal(event.get('LAST-MODIFIED'), '20261002T030000Z');
    assert.equal(event.get('CREATED'), '20261001T010000Z');
  });

  test('活動轉為待審或來源不再核准後，從行事曆移除', async () => {
    // 缺標題 → 該活動變成 needs_review
    processAnnouncement(getDb(), { ...raw, title: null }, { defaultCategory: 'lecture' });
    let { body } = await getCalendar('lecture');
    assert.deepEqual(
      parseEvents(body).map((event) => event.get('UID')),
      [`event-${allDayId}@eventou`],
    );
    getDb().prepare("UPDATE sources SET review_status = 'rejected' WHERE id = 1").run();
    ({ body } = await getCalendar('lecture'));
    assertValidCalendar(body);
    assert.deepEqual(parseEvents(body), []);
  });
});

describe('GET /api/calendars/categories（US-05）', () => {
  test('列出所有類別、顯示名稱與訂閱路徑', async () => {
    const response = await fetch(`${baseUrl}/api/calendars/categories`);
    assert.equal(response.status, 200);
    const { categories } = (await response.json()) as {
      categories: { category: string; label: string; icsPath: string }[];
    };
    assert.deepEqual(
      categories.map((item) => item.category),
      [...EVENT_CATEGORIES],
    );
    assert.deepEqual(categories[0], {
      category: 'lecture',
      label: '講座',
      icsPath: '/api/calendars/categories/lecture.ics',
    });
  });
});

describe('buildCalendar', () => {
  const event: CalendarEvent = {
    id: 7,
    title: '講座; 第一場, 海洋\\科技',
    description: '第一行\n第二行',
    startTime: '2026-10-07T14:00:00+08:00',
    endTime: null,
    allDay: false,
    location: null,
    registrationUrl: 'https://example.com/signup',
    originalUrl: 'https://example.com/event/7',
    createdAt: reference,
    updatedAt: reference,
  };

  test('跳脫 TEXT 的特殊字元與換行', () => {
    const [parsed] = parseEvents(buildCalendar('測試', [event]));
    assert.equal(parsed.get('SUMMARY'), '講座\\; 第一場\\, 海洋\\\\科技');
    assert.equal(
      parsed.get('DESCRIPTION'),
      '第一行\\n第二行\\n\\n報名連結：https://example.com/signup\\n\\n原始公告：https://example.com/event/7',
    );
    assert.ok(!parsed.has('DTEND'));
    assert.ok(!parsed.has('LOCATION'));
  });

  test('長行以 75 位元組折行，且不切斷中文字', () => {
    const title = '海洋'.repeat(60);
    const ics = buildCalendar('測試', [{ ...event, title }]);
    assertValidCalendar(ics);
    assert.equal(parseEvents(ics)[0].get('SUMMARY'), title);
  });
});
