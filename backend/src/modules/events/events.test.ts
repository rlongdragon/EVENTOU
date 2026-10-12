import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { migrate } from '../../db/index.js';
import { cleanAnnouncement, httpUrl } from './events.cleaner.js';
import { convertAnnouncement } from './events.converter.js';
import { parseEventDates } from './events.dates.js';
import { processAnnouncement } from './events.service.js';
import { upsertEvent } from './events.repository.js';
import type { RawAnnouncement } from './events.types.js';

process.env.DATABASE_PATH = ':memory:';
const reference = '2026-10-01T09:00:00+08:00';
const raw: RawAnnouncement = {
  sourceId: 1,
  url: 'https://www.ntou.edu.tw/event/1',
  title: '海大講座',
  rawContent: '活動日期：2026/10/07 14:00-16:00',
  publishedAt: reference,
  fetchedAt: reference,
};
const cases = [
  ['2026/10/7 14:00-2026/10/8 16:00', '2026-10-07T14:00:00+08:00', '2026-10-08T16:00:00+08:00'],
  ['2026/10/07 14:00-16:00', '2026-10-07T14:00:00+08:00', '2026-10-07T16:00:00+08:00'],
  ['115/10/07 下午2:00-4:00', '2026-10-07T14:00:00+08:00', '2026-10-07T16:00:00+08:00'],
  ['民國115年10月7日 下午2點半', '2026-10-07T14:30:00+08:00', null],
  ['10月7日（三） 上午10:00-中午12:00', '2026-10-07T10:00:00+08:00', '2026-10-07T12:00:00+08:00'],
  ['10/7–10/9', '2026-10-07T00:00:00+08:00', '2026-10-10T00:00:00+08:00'],
  ['10/12-10/14', '2026-10-12T00:00:00+08:00', '2026-10-15T00:00:00+08:00'],
  ['10.12-10.14', '2026-10-12T00:00:00+08:00', '2026-10-15T00:00:00+08:00'],
  ['10/12 - 10/14', '2026-10-12T00:00:00+08:00', '2026-10-15T00:00:00+08:00'],
  ['2026/12/31-1/2', '2026-12-31T00:00:00+08:00', '2027-01-03T00:00:00+08:00'],
  ['2026/10/7 12:00 AM', '2026-10-07T00:00:00+08:00', null],
  ['2026/10/7 12:00 PM', '2026-10-07T12:00:00+08:00', null],
];
for (const [content, startTime, endTime] of cases)
  test(`日期格式：${content}`, () => {
    const result = parseEventDates(content ?? '', reference);
    assert.equal(result.startTime, startTime);
    assert.equal(result.endTime, endTime);
    assert.deepEqual(result.reasons, []);
  });
for (const content of [
  '2026/2/29',
  '2026/13/7',
  '2026/10/7 25:00',
  '2026/10/7 14:70',
  '2026/10/7 16:00-14:00',
  '2026/10/7 下午二時',
  '2026/10/7 14:00-',
  '2026/10/7、10/9',
  '日期：待定',
  '10/12-14',
  '2026/10/7 晚上12點',
  '1921/12/10',
])
  test(`不猜測無效日期：${content}`, () => {
    assert.equal(parseEventDates(content, reference).startTime, null);
  });
test('清理 HTML、全形字元、空白及 script', () => {
  assert.equal(
    cleanAnnouncement('<p>ＡＩ　講座&nbsp;１２３</p><script>bad()</script><p>地　　點：甲子廳</p>')
      .text,
    'AI 講座 123\n\n地點:甲子廳',
  );
});
test('截止日不取代活動日期，分行時間及欄位可擷取', () => {
  const event = convertAnnouncement({
    ...raw,
    rawContent:
      '<p>報名截止：2026/10/5</p><p>日期：115年10月7日</p><p>時間：下午2:00-4:00</p><p>地點：甲子廳</p><p>主辦單位：國立臺灣海洋大學</p><a href="/register">報名</a>',
  });
  assert.equal(event.status, 'published');
  assert.equal(event.startTime, '2026-10-07T14:00:00+08:00');
  assert.equal(event.location, '甲子廳');
  assert.equal(event.organizer, '國立臺灣海洋大學');
  assert.equal(event.registrationUrl, 'https://www.ntou.edu.tw/register');
});
test('缺必填欄位或原始連結無效時進入待審', () => {
  for (const override of [
    { title: null },
    { rawContent: '' },
    { sourceId: null },
    { url: null },
    { url: 'javascript:alert(1)' },
  ])
    assert.equal(convertAnnouncement({ ...raw, ...override }).status, 'needs_review');
});
test('標題規則覆寫來源分類，標籤去重', () => {
  const event = convertAnnouncement(
    { ...raw, title: '海大工作坊' },
    { defaultCategory: 'lecture', tags: [' ＡＩ ', 'AI', ''] },
  );
  assert.equal(event.category, 'workshop');
  assert.deepEqual(event.tags, ['AI']);
});
test('地點、主辦欄位不參與分類', () => {
  const rawContent = raw.rawContent + '\n地點：體育館\n主辦單位：體育室';
  assert.equal(convertAnnouncement({ ...raw, title: '專題', rawContent }).category, null);
  assert.equal(
    convertAnnouncement({ ...raw, title: '專題', rawContent }, { defaultCategory: 'lecture' })
      .category,
    'lecture',
  );
  assert.equal(
    convertAnnouncement({ ...raw, title: '專題', rawContent: rawContent + '\n體育競賽' }).category,
    'sports',
  );
});
test('指回公告頁的報名錨點不取代純文字報名網址', () => {
  const event = convertAnnouncement({
    ...raw,
    rawContent: raw.rawContent + '\n<a href="#">報名</a>\n報名連結：https://forms.gle/example',
  });
  assert.equal(event.registrationUrl, 'https://forms.gle/example');
});
interface Fixture {
  url: string;
  excerptSource: string;
  captureKind: string;
  title: string;
  rawContent: string;
  startTime: string;
  endTime: string | null;
}
const fixtures: Fixture[] = JSON.parse(
  readFileSync(new URL('./fixtures/ntou-announcements.json', import.meta.url), 'utf8'),
);
const isNtouUrl = (url: string) => /(?:^|\.)ntou\.edu\.tw$/.test(new URL(url).hostname);
test('20 則真實公告摘錄有不同原始網址與來源記錄', () => {
  assert.equal(fixtures.length, 20);
  assert.equal(new Set(fixtures.map((f) => f.url)).size, 20);
  for (const fixture of fixtures)
    assert.ok(isNtouUrl(fixture.url) && isNtouUrl(fixture.excerptSource));
});
for (const fixture of fixtures)
  test(`海大公告：${fixture.title} ${fixture.url}`, () => {
    const event = convertAnnouncement({ ...raw, ...fixture }, { defaultCategory: 'lecture' });
    assert.equal(event.status, 'published', event.reviewReasons.join(';'));
    assert.equal(event.startTime, fixture.startTime);
    assert.equal(event.endTime, fixture.endTime);
  });
test('冪等更新保留 id 與建立時間，待審不出現在公開 view，缺追溯鍵拒絕儲存', () => {
  const db = new DatabaseSync(':memory:');
  try {
    migrate(db);
    const first = processAnnouncement(db, raw, {}, new Date(reference));
    const second = processAnnouncement(
      db,
      { ...raw, title: '更新後海大講座' },
      {},
      new Date('2026-10-02T09:00:00+08:00'),
    );
    assert.equal(first.id, second.id);
    assert.equal(first.createdAt, second.createdAt);
    assert.notEqual(first.updatedAt, second.updatedAt);
    const rerun = processAnnouncement(
      db,
      { ...raw, title: '更新後海大講座' },
      {},
      new Date('2026-10-03T09:00:00+08:00'),
    );
    assert.equal(rerun.updatedAt, second.updatedAt);
    assert.equal(db.prepare('SELECT updated_at FROM events').get()?.updated_at, second.updatedAt);
    assert.equal(db.prepare('SELECT count(*) AS n FROM events').get()?.n, 1);
    assert.equal(db.prepare('SELECT title FROM published_events').get()?.title, '更新後海大講座');
    const review = processAnnouncement(db, { ...raw, rawContent: '' });
    assert.equal(review.status, 'needs_review');
    assert.equal(db.prepare('SELECT count(*) AS n FROM published_events').get()?.n, 0);
    assert.throws(() => processAnnouncement(db, { ...raw, sourceId: null }), /追溯/);
    processAnnouncement(db, { ...raw, sourceId: 2 });
    assert.equal(db.prepare('SELECT count(*) AS n FROM events').get()?.n, 2);
  } finally {
    db.close();
  }
});

test('儲存再次驗證，不能自行指定 published 繞過日期或必填檢查', () => {
  const db = new DatabaseSync(':memory:');
  try {
    migrate(db);
    const converted = convertAnnouncement(raw);
    for (const override of [
      { startTime: '2026-02-30T14:00:00+08:00' },
      { endTime: '2026-10-07T13:00:00+08:00' },
      { title: '' },
    ]) {
      const event = upsertEvent(db, {
        ...converted,
        ...override,
        status: 'published',
        reviewReasons: [],
      });
      assert.equal(event.status, 'needs_review');
    }
    assert.equal(db.prepare('SELECT count(*) AS n FROM published_events').get()?.n, 0);
  } finally {
    db.close();
  }
});

test('拒絕帳密網址，允許外部報名表', () => {
  assert.equal(httpUrl('https://ntou.edu.tw@evil.com/1'), null);
  const event = convertAnnouncement({
    ...raw,
    rawContent: raw.rawContent + '\n報名連結：https://forms.gle/example',
  });
  assert.equal(event.status, 'published');
  assert.equal(event.registrationUrl, 'https://forms.gle/example');
});

test('未寫年取台北參考年份，無參考年份不猜測', () => {
  assert.equal(
    parseEventDates('1月1日', '2025-12-31T17:00:00Z').startTime,
    '2026-01-01T00:00:00+08:00',
  );
  assert.equal(parseEventDates('1月1日', 'invalid').startTime, null);
});

test('未寫年份跨年時取最接近公告日的年份', () => {
  assert.equal(
    parseEventDates('1/5 14:00-16:00', '2026-12-20T09:00:00+08:00').startTime,
    '2027-01-05T14:00:00+08:00',
  );
  assert.equal(
    parseEventDates('12/28', '2027-01-05T09:00:00+08:00').startTime,
    '2026-12-28T00:00:00+08:00',
  );
});

test('寫明年份時須接近公告時間，閏日依該年份判斷', () => {
  assert.equal(
    parseEventDates('2024/2/29', '2024-01-10T09:00:00+08:00').startTime,
    '2024-02-29T00:00:00+08:00',
  );
  assert.deepEqual(parseEventDates('2029/10/7', reference).reasons, ['活動年份與公告時間差距過大']);
});

test('發布時間無法解析時改用擷取時間推論年份', () => {
  const event = convertAnnouncement({
    ...raw,
    rawContent: '活動日期：10月7日',
    publishedAt: '2026/10/01 09:00',
  });
  assert.equal(event.startTime, '2026-10-07T00:00:00+08:00');
  assert.deepEqual(parseEventDates('10月7日', null, null).reasons, ['缺少可判斷年份的公告時間']);
});

test('公告的多組活動日期與待定日期保留待審', () => {
  assert.equal(
    convertAnnouncement({ ...raw, rawContent: '活动\n活動日期：2026/10/7\n活動日期：2026/10/8' })
      .status,
    'needs_review',
  );
  assert.equal(
    convertAnnouncement({ ...raw, title: '2026/10/7 海大講座', rawContent: '日期：待定' }).status,
    'needs_review',
  );
});
