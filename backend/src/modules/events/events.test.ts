import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { migrate } from '../../db/index.js';
import { cleanAnnouncement, isNtouUrl } from './events.cleaner.js';
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
  ['2026/12/31-1/2', '2026-12-31T00:00:00+08:00', '2027-01-03T00:00:00+08:00'],
  ['2024/2/29', '2024-02-29T00:00:00+08:00', null],
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
test('缺必填、外校及轉知公告進入待審；外校來賓不影響海大活動', () => {
  for (const override of [
    { title: null },
    { rawContent: '' },
    { sourceId: null },
    { url: null },
    { url: 'https://ntu.edu.tw/1' },
    { url: 'https://ntou.edu.tw.evil.com/1' },
    { title: '轉知講座' },
    { rawContent: raw.rawContent + '\n主辦單位：國立臺灣大學' },
  ])
    assert.equal(convertAnnouncement({ ...raw, ...override }).status, 'needs_review');
  assert.equal(
    convertAnnouncement({ ...raw, rawContent: raw.rawContent + '\n講者：國立臺灣大學教授' }).status,
    'published',
  );
  assert.equal(isNtouUrl('https://x.ntou.edu.tw/a'), true);
});
test('標題規則覆寫來源分類，標籤去重', () => {
  const event = convertAnnouncement(
    { ...raw, title: '海大工作坊' },
    { defaultCategory: 'lecture', tags: [' ＡＩ ', 'AI', ''] },
  );
  assert.equal(event.category, 'workshop');
  assert.deepEqual(event.tags, ['AI']);
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

test('儲存再次驗證，不能自行指定 published 繞過日期或海大限制', () => {
  const db = new DatabaseSync(':memory:');
  try {
    migrate(db);
    const converted = convertAnnouncement(raw);
    for (const override of [
      { startTime: '2026-02-30T14:00:00+08:00' },
      { originalUrl: 'https://ntu.edu.tw/1' },
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

test('原始公告安全網域與正文轉知檢查，允許外部報名表', () => {
  for (const rawContent of [
    raw.rawContent + '\n主辦單位：中國海洋大學',
    '轉知校外公告\n' + raw.rawContent,
  ])
    assert.equal(convertAnnouncement({ ...raw, rawContent }).status, 'needs_review');
  assert.equal(isNtouUrl('https://ntou.edu.tw@evil.com/1'), false);
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
