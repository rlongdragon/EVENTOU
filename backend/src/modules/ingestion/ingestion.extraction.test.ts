import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { migrate } from '../../db/index.js';
import { convertAnnouncement } from '../events/events.converter.js';
import type { RawAnnouncement } from '../events/events.types.js';
import { seedSources } from '../sources/sources.testHelpers.js';
import { detectSourceType } from './ingestion.detect.js';
import { extractAnnouncements, type ExtractionConfig } from './ingestion.extraction.js';
import { parseFeed } from './ingestion.feed.js';
import { generateExtractionConfig } from './ingestion.generate.js';
import { parseIcs } from './ingestion.ical.js';
import { ScraperClient } from './ingestion.scraper.js';
import { IngestionService } from './ingestion.service.js';

process.env.DATABASE_PATH = ':memory:';

// 範例檔依 RSS 2.0、Atom、iCalendar 與一般網頁的實際格式手寫，不是從真實來源擷取的內容。
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

/** 依網址回傳固定內容的 ScraperClient；robots.txt 回 404（視為無限制），其他網址回 404。 */
function clientFor(pages: Record<string, string>): ScraperClient {
  return new ScraperClient(async (input) => {
    const url = String(input);
    if (url in pages) return new Response(pages[url]);
    return new Response('not found', { status: 404 });
  }, 0);
}

async function collect(generator: AsyncGenerator<RawAnnouncement>): Promise<RawAnnouncement[]> {
  const items: RawAnnouncement[] = [];
  for await (const item of generator) items.push(item);
  return items;
}

test('偵測來源類型：iCalendar、RSS、Atom、頁面宣告的 feed、一般網頁', () => {
  assert.equal(detectSourceType('https://e.com/a.ics', fixture('calendar.ics')).type, 'ical');
  assert.equal(detectSourceType('https://e.com/rss', fixture('rss.xml')).type, 'feed');
  assert.equal(detectSourceType('https://e.com/atom', fixture('atom.xml')).type, 'feed');
  const linked = detectSourceType('https://e.com/news/', fixture('html-with-feed-link.html'));
  assert.equal(linked.type, 'feed');
  assert.equal(linked.feedUrl, 'https://e.com/feed.xml');
  assert.equal(detectSourceType('https://e.com/', fixture('html-list.html')).type, 'html');
});

test('偵測不出類型時說明原因：空內容、需要 JavaScript、非 feed 的 XML、純文字', () => {
  assert.equal(detectSourceType('https://e.com/', '  \n').type, 'unknown');
  const app = detectSourceType('https://e.com/', fixture('html-js-app.html'));
  assert.equal(app.type, 'unknown');
  assert.match(app.reason, /JavaScript/);
  const sitemap = detectSourceType(
    'https://e.com/sitemap.xml',
    '<?xml version="1.0"?><urlset><url><loc>https://e.com/</loc></url></urlset>',
  );
  assert.equal(sitemap.type, 'unknown');
  assert.match(sitemap.reason, /urlset/);
  assert.equal(detectSourceType('https://e.com/', 'hello world').type, 'unknown');
});

test('解析 RSS：解析相對連結、去除 hash、轉台北發布日期，略過缺連結的項目', () => {
  const items = parseFeed(fixture('rss.xml'), 'https://news.example.edu.tw/rss.xml');
  assert.deepEqual(
    items.map((item) => item.url),
    [
      'https://news.example.edu.tw/p/101.php',
      'https://news.example.edu.tw/p/102.php',
      'https://news.example.edu.tw/p/103.php',
    ],
  );
  assert.equal(items[0].title, '【講座】AI 與海洋研究');
  assert.match(items[0].content, /綜合教學館 101 教室/);
  assert.equal(items[0].publishedAt, '2026-10-12');
  // content:encoded 優先於 description；UTC 23:00 是台北隔天 07:00
  assert.match(items[1].content, /體育室/);
  assert.equal(items[1].publishedAt, '2026-10-12');
  // 沒有內文與日期時，以標題當內文、發布日期為 null
  assert.equal(items[2].content, '只有標題的公告 11/5 舉行');
  assert.equal(items[2].publishedAt, null);
});

test('解析 Atom：用 rel=alternate 的連結，內文為解開跳脫的 HTML', () => {
  const items = parseFeed(fixture('atom.xml'), 'https://club.example.edu.tw/atom.xml');
  assert.equal(items.length, 2);
  assert.equal(items[0].url, 'https://club.example.edu.tw/events/guitar');
  assert.match(items[0].content, /<p>活動日期：2026-10-24<\/p>/);
  assert.equal(items[0].publishedAt, '2026-10-10');
  // 沒有 published 時退而使用 updated；沒有 rel 的連結也可用
  assert.equal(items[1].url, 'https://club.example.edu.tw/events/photo');
  assert.equal(items[1].publishedAt, '2026-10-09');
});

test('解析 iCalendar：跳脫字元、接續行、VALARM、各種時區與整天活動', () => {
  const events = parseIcs(fixture('calendar.ics'));
  assert.equal(events.length, 5);
  const [meeting, sports, exams, webinar, noSummary] = events;
  assert.equal(meeting.summary, 'AI 與海洋研究講座');
  assert.equal(meeting.description, '主講：王老師\n歡迎自由參加, 免報名');
  assert.deepEqual(meeting.start, { date: '2026-10-20', time: '14:00' });
  assert.deepEqual(meeting.end, { date: '2026-10-20', time: '16:00' });
  assert.equal(meeting.location, '綜合教學館 101 教室');
  // UTC 00:30 是台北 08:30
  assert.deepEqual(sports.start, { date: '2026-11-03', time: '08:30' });
  assert.deepEqual(sports.end, { date: '2026-11-03', time: '12:00' });
  assert.equal(sports.description, '這是一段很長的說明文字，需要用接續行拆成多行才能完整讀取。');
  // 整天活動的 DTEND 是結束日的隔天
  assert.deepEqual(exams.start, { date: '2026-11-10', time: null });
  assert.deepEqual(exams.end, { date: '2026-11-12', time: null });
  // 紐約 11/15 為標準時間（UTC-5），09:00 是台北當天 22:00
  assert.deepEqual(webinar.start, { date: '2026-11-15', time: '22:00' });
  assert.equal(noSummary.summary, '');
});

test('iCalendar 轉成的公告內文，US-19 可以解析出時間與地點', () => {
  const config: ExtractionConfig = {
    kind: 'ical',
    listUrl: 'https://events.example.edu.tw/calendar.ics',
    maxAnnouncements: 20,
  };
  return collect(
    extractAnnouncements(1, config, clientFor({ [config.listUrl]: fixture('calendar.ics') })),
  ).then((raws) => {
    // 開始時間較晚的在前；沒有 SUMMARY 的 VEVENT 不會成為公告
    assert.deepEqual(
      raws.map((raw) => raw.title),
      ['跨時區線上研討會', '期中考週', '運動會', 'AI 與海洋研究講座'],
    );
    const byTitle = new Map(raws.map((raw) => [raw.title, raw]));
    const meeting = byTitle.get('AI 與海洋研究講座')!;
    assert.equal(meeting.url, 'https://events.example.edu.tw/evt-1');
    assert.equal(byTitle.get('運動會')!.url, `${config.listUrl}#evt-2%40example.edu.tw`);
    const event = convertAnnouncement(meeting);
    assert.equal(event.startTime, '2026-10-20T14:00:00+08:00');
    assert.equal(event.endTime, '2026-10-20T16:00:00+08:00');
    assert.equal(event.location, '綜合教學館 101 教室');
    assert.equal(event.status, 'published');
    const exams = convertAnnouncement(byTitle.get('期中考週')!);
    assert.equal(exams.allDay, true);
    assert.equal(exams.startTime?.slice(0, 10), '2026-11-10');
  });
});

test('RSS 公告轉成活動：日期取自內文，沿用 US-19 的轉換', async () => {
  const config: ExtractionConfig = {
    kind: 'feed',
    listUrl: 'https://news.example.edu.tw/',
    feedUrl: 'https://news.example.edu.tw/rss.xml',
    maxAnnouncements: 2,
  };
  const raws = await collect(
    extractAnnouncements(1, config, clientFor({ [config.feedUrl]: fixture('rss.xml') })),
  );
  assert.equal(raws.length, 2, '依 maxAnnouncements 截斷');
  const event = convertAnnouncement(raws[0]);
  assert.equal(event.startTime, '2026-10-20T14:00:00+08:00');
  assert.equal(event.location, '綜合教學館 101 教室');
  assert.equal(event.sourceId, 1);
});

test('feed 或 iCalendar 沒有可用項目時擷取失敗並說明原因', async () => {
  const feed: ExtractionConfig = {
    kind: 'feed',
    listUrl: 'https://e.com/',
    feedUrl: 'https://e.com/feed',
    maxAnnouncements: 20,
  };
  await assert.rejects(
    collect(extractAnnouncements(1, feed, clientFor({ [feed.feedUrl]: '<rss><channel/></rss>' }))),
    /feed 未找到可用項目/,
  );
  const ical: ExtractionConfig = {
    kind: 'ical',
    listUrl: 'https://e.com/a.ics',
    maxAnnouncements: 20,
  };
  await assert.rejects(
    collect(
      extractAnnouncements(
        1,
        ical,
        clientFor({ [ical.listUrl]: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR' }),
      ),
    ),
    /iCalendar 未找到可用的活動/,
  );
});

test('產生設定：iCalendar、RSS、頁面宣告的 feed', async () => {
  const ics = await generateExtractionConfig(
    'https://e.com/a.ics',
    clientFor({ 'https://e.com/a.ics': fixture('calendar.ics') }),
  );
  assert.equal(ics.status, 'generated');
  assert.deepEqual(ics.status === 'generated' && ics.config, {
    kind: 'ical',
    listUrl: 'https://e.com/a.ics',
    maxAnnouncements: 20,
  });

  const rss = await generateExtractionConfig(
    'https://e.com/rss.xml',
    clientFor({ 'https://e.com/rss.xml': fixture('rss.xml') }),
    5,
  );
  assert.deepEqual(rss.status === 'generated' && rss.config, {
    kind: 'feed',
    listUrl: 'https://e.com/rss.xml',
    feedUrl: 'https://e.com/rss.xml',
    maxAnnouncements: 5,
  });

  const linked = await generateExtractionConfig(
    'https://e.com/news/',
    clientFor({
      'https://e.com/news/': fixture('html-with-feed-link.html'),
      'https://e.com/feed.xml': fixture('atom.xml'),
    }),
  );
  assert.deepEqual(linked.status === 'generated' && linked.config, {
    kind: 'feed',
    listUrl: 'https://e.com/news/',
    feedUrl: 'https://e.com/feed.xml',
    maxAnnouncements: 20,
  });
});

test('產生設定：無法判斷、內容不可用或抓取失敗時標記需人工設定並說明原因', async () => {
  const cases: [string, Record<string, string>, RegExp][] = [
    ['https://e.com/', { 'https://e.com/': fixture('html-list.html') }, /人工設定/],
    ['https://e.com/', { 'https://e.com/': fixture('html-js-app.html') }, /JavaScript/],
    ['https://e.com/', { 'https://e.com/': 'plain text' }, /不是 iCalendar/],
    ['https://e.com/rss', { 'https://e.com/rss': '<rss><channel/></rss>' }, /沒有可用的項目/],
    [
      'https://e.com/a.ics',
      { 'https://e.com/a.ics': 'BEGIN:VCALENDAR\r\nEND:VCALENDAR' },
      /沒有可用的活動/,
    ],
    ['https://e.com/gone', {}, /無法取得來源內容/],
    [
      'https://e.com/news/',
      { 'https://e.com/news/': fixture('html-with-feed-link.html') },
      /無法取得頁面宣告的 feed/,
    ],
    [
      'https://e.com/news/',
      {
        'https://e.com/news/': fixture('html-with-feed-link.html'),
        'https://e.com/feed.xml': fixture('html-list.html'),
      },
      /不是 RSS／Atom/,
    ],
  ];
  for (const [url, pages, reason] of cases) {
    const result = await generateExtractionConfig(url, clientFor(pages));
    assert.equal(result.status, 'manual_required', url);
    assert.match(result.reason, reason);
  }
});

test('US-17 的服務可以直接使用 feed 設定擷取並寫入活動', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  migrate(db);
  seedSources(db, 1);
  const config: ExtractionConfig = {
    kind: 'feed',
    listUrl: 'https://example.com/source-1',
    feedUrl: 'https://news.example.edu.tw/rss.xml',
    maxAnnouncements: 20,
  };
  db.exec("UPDATE sources SET review_status='approved' WHERE id=1");
  const service = new IngestionService(
    db,
    [config],
    clientFor({ [config.feedUrl]: fixture('rss.xml') }),
  );
  const run = await service.runSource(1);
  assert.equal(run.status, 'success');
  assert.equal(run.insertedCount, 3);
  const event = db
    .prepare(
      "SELECT status, start_time AS startTime FROM events WHERE original_url LIKE '%/101.php'",
    )
    .get();
  assert.deepEqual({ ...event }, { status: 'published', startTime: '2026-10-20T14:00:00+08:00' });
  db.close();
});
