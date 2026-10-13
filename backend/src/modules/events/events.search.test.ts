import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../../app.js';
import { closeDb, getDb, migrate } from '../../db/index.js';
import { seedSources } from '../sources/sources.testHelpers.js';
import { processAnnouncement } from './events.service.js';
import type { EventCategory, RawAnnouncement } from './events.types.js';

process.env.DATABASE_PATH = ':memory:';

interface SearchItem {
  id: number;
  title: string;
  category: string;
  categoryLabel: string;
  startTime: string;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
}

interface SearchBody {
  items: SearchItem[];
  page: number;
  pageSize: number;
  total: number;
  categories: { code: string; label: string }[];
}

let server: Server;
let baseUrl: string;
let counter = 0;

// 未結束的活動放在 2099 年、已結束的放在 2020 年，測試結果不受執行日期影響
function addEvent(
  title: string | null,
  rawContent: string,
  category: EventCategory = 'lecture',
  year = 2099,
) {
  counter += 1;
  const raw: RawAnnouncement = {
    sourceId: 1,
    url: `https://www.ntou.edu.tw/search-test/${counter}`,
    title,
    rawContent,
    publishedAt: `${year}-01-01`,
    fetchedAt: `${year}-01-01`,
  };
  return processAnnouncement(getDb(), raw, { defaultCategory: category });
}

before(async () => {
  migrate();
  seedSources(getDb()); // events.source_id 需對應到 sources
  addEvent('海大活動 B', '活動日期：2099/03/02 14:00-16:00\n地點：甲子廳');
  addEvent('海大活動 A', '活動日期：2099/03/01 10:00-12:00\n主辦單位：資訊工程學系');
  addEvent('海大活動 C', '活動日期：2099/03/03 14:00-16:00\n內容：Python 入門', 'sports');
  const ended = addEvent('已結束的活動', '活動日期：2020/01/10 14:00-16:00', 'lecture', 2020);
  assert.equal(ended.status, 'published');
  const review = addEvent(null, '活動日期：2099/03/04 14:00-16:00'); // 缺標題 → needs_review
  assert.equal(review.status, 'needs_review');
  for (let day = 1; day <= 25; day += 1)
    addEvent(`福利活動 ${day}`, `活動日期：2099/04/${String(day).padStart(2, '0')}`, 'welfare');
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  closeDb();
});

async function search(query = '') {
  const response = await fetch(`${baseUrl}/api/events${query}`);
  return { status: response.status, body: (await response.json()) as SearchBody };
}

describe('GET /api/events（US-01）', () => {
  test('未登入可搜尋；只列已發布且尚未結束的活動，依開始時間由近到遠排序', async () => {
    const { status, body } = await search('?category=lecture');
    assert.equal(status, 200);
    assert.deepEqual(
      body.items.map((item) => item.title),
      ['海大活動 A', '海大活動 B'],
    );
    assert.equal(body.total, 2);
    const [first] = body.items;
    assert.equal(first?.startTime, '2099-03-01T10:00:00+08:00');
    assert.equal(first?.endTime, '2099-03-01T12:00:00+08:00');
    assert.equal(first?.allDay, false);
    assert.equal(first?.category, 'lecture');
    assert.equal(first?.categoryLabel, '講座');
  });

  test('關鍵字不分大小寫，比對標題、說明、地點、主辦單位', async () => {
    const titles = async (q: string) =>
      (await search(`?q=${encodeURIComponent(q)}`)).body.items.map((item) => item.title);
    assert.deepEqual(await titles('活動 b'), ['海大活動 B']);
    assert.deepEqual(await titles('python'), ['海大活動 C']);
    assert.deepEqual(await titles('甲子廳'), ['海大活動 B']);
    assert.deepEqual(await titles('資訊工程'), ['海大活動 A']);
    assert.deepEqual(await titles('%'), []);
  });

  test('可依類別篩選，回應附上類別清單', async () => {
    const { body } = await search('?category=sports');
    assert.deepEqual(
      body.items.map((item) => item.title),
      ['海大活動 C'],
    );
    assert.deepEqual(body.categories[0], { code: 'lecture', label: '講座' });
    assert.equal(body.categories.length, 5);
  });

  test('已結束與待審（needs_review）的活動不會出現', async () => {
    const { body } = await search();
    assert.equal(body.total, 28);
    assert.ok(body.items.every((item) => item.title !== '已結束的活動' && item.title !== ''));
  });

  test('分頁預設每頁 20 筆', async () => {
    const first = await search('?category=welfare');
    assert.equal(first.body.page, 1);
    assert.equal(first.body.pageSize, 20);
    assert.equal(first.body.total, 25);
    assert.equal(first.body.items.length, 20);
    assert.equal(first.body.items[0]?.title, '福利活動 1');
    const second = await search('?category=welfare&page=2');
    assert.deepEqual(
      second.body.items.map((item) => item.title),
      ['福利活動 21', '福利活動 22', '福利活動 23', '福利活動 24', '福利活動 25'],
    );
  });

  test('page、page_size 格式錯誤時用預設值，page_size 上限 100', async () => {
    const invalid = await search('?page=abc&page_size=-1');
    assert.equal(invalid.status, 200);
    assert.equal(invalid.body.page, 1);
    assert.equal(invalid.body.pageSize, 20);
    assert.equal((await search('?page_size=1000')).body.pageSize, 100);
  });
});
