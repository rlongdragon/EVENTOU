import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../../app.js';
import { closeDb, getDb, migrate } from '../../db/index.js';
import { processAnnouncement } from '../events/events.service.js';
import type { RawAnnouncement } from '../events/events.types.js';
import { seedSources } from '../sources/sources.testHelpers.js';
import { CAMPUS_CENTER, CAMPUS_PLACES } from './map.places.js';

process.env.DATABASE_PATH = ':memory:';

let server: Server;
let baseUrl: string;
const originalFetch = globalThis.fetch;
const externalRequests: string[] = [];

function placeCoordinates(name: string) {
  const place = CAMPUS_PLACES.find((item) => item.name === name);
  assert.ok(place, `對照表缺少 ${name}`);
  return { latitude: place.latitude, longitude: place.longitude };
}

before(async () => {
  // 地圖不應呼叫任何外部地理編碼服務；記錄非本機請求以便驗證
  globalThis.fetch = (async (input, init) => {
    if (!String(input).startsWith('http://localhost:')) externalRequests.push(String(input));
    return originalFetch(input, init);
  }) as typeof fetch;

  migrate();
  seedSources(getDb());
  const base: RawAnnouncement = {
    sourceId: 1,
    url: 'https://example.com/map-event-1',
    title: '校園地圖講座',
    rawContent: '活動日期：2099/03/02 14:00-16:00\n地點：食品科學系甲子廳',
    publishedAt: '2099-02-01T09:00:00+08:00',
    fetchedAt: '2099-02-01T09:01:00+08:00',
  };
  processAnnouncement(getDb(), base, { defaultCategory: 'lecture' });
  processAnnouncement(
    getDb(),
    {
      ...base,
      url: 'https://example.com/map-event-2',
      title: '校園地圖運動',
      rawContent: '活動日期：2099/03/03 14:00-16:00\n地點：體育館',
    },
    { defaultCategory: 'sports' },
  );
  processAnnouncement(
    getDb(),
    {
      ...base,
      url: 'https://example.com/map-event-3',
      title: '沒有地點的活動',
      rawContent: '活動日期：2099/03/02 14:00-16:00',
    },
    { defaultCategory: 'lecture' },
  );
  processAnnouncement(
    getDb(),
    {
      ...base,
      url: 'https://example.com/map-event-4',
      title: '無法定位的活動',
      rawContent: '活動日期：2099/03/02 14:00-16:00\n地點：綜合二館3樓303R',
    },
    { defaultCategory: 'lecture' },
  );

  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  closeDb();
  globalThis.fetch = originalFetch;
  assert.deepEqual(externalRequests, []);
});

async function getMapEvents(query = '') {
  const response = await fetch(`${baseUrl}/api/map/events${query}`);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

function getEventId(title: string): number {
  const row = getDb().prepare('SELECT id FROM published_events WHERE title = ?').get(title) as
    { id: number } | undefined;
  assert.ok(row);
  return Number(row.id);
}

interface MapItem {
  title: string;
  location: string;
  categoryLabel: string;
  coordinates: { latitude: number; longitude: number } | null;
  placeName: string | null;
}

describe('GET /api/map/events（US-04）', () => {
  test('依校內建物對照表回傳座標，對不到的活動座標為 null', async () => {
    const { status, body } = await getMapEvents('?from=2099-03-02&to=2099-03-02');
    assert.equal(status, 200);
    const items = body.items as MapItem[];
    assert.deepEqual(
      items.map((item) => item.title),
      ['校園地圖講座', '無法定位的活動'],
    );
    assert.equal(items[0].location, '食品科學系甲子廳');
    assert.equal(items[0].categoryLabel, '講座');
    assert.equal(items[0].placeName, '食品科學學系館');
    assert.deepEqual(items[0].coordinates, placeCoordinates('食品科學學系館'));
    assert.equal(items[1].coordinates, null);
    assert.equal(items[1].placeName, null);
    assert.deepEqual(body.campus, CAMPUS_CENTER);
    assert.ok(Array.isArray(body.categories));
  });

  test('未指定日期時回傳所有日期且有地點資料的活動', async () => {
    const { status, body } = await getMapEvents('');
    assert.equal(status, 200);
    const items = body.items as MapItem[];
    assert.deepEqual(
      items.map((item) => item.title),
      ['校園地圖講座', '無法定位的活動', '校園地圖運動'],
    );
    assert.deepEqual(items[2].coordinates, placeCoordinates('體育館'));
  });

  test('依日期範圍篩選，範圍包含開始與結束日期', async () => {
    const titles = async (query: string) => {
      const { status, body } = await getMapEvents(query);
      assert.equal(status, 200);
      return (body.items as MapItem[]).map((item) => item.title);
    };
    assert.deepEqual(await titles('?from=2099-03-02&to=2099-03-03'), [
      '校園地圖講座',
      '無法定位的活動',
      '校園地圖運動',
    ]);
    assert.deepEqual(await titles('?from=2099-03-03&to=2099-03-03'), ['校園地圖運動']);
    // 只給開始或結束日期時，另一端不設限
    assert.deepEqual(await titles('?from=2099-03-03'), ['校園地圖運動']);
    assert.deepEqual(await titles('?to=2099-03-02'), ['校園地圖講座', '無法定位的活動']);
  });

  test('可同時依日期範圍與類別篩選，且不登入也能使用', async () => {
    const { status, body } = await getMapEvents('?from=2099-03-01&to=2099-03-31&category=sports');
    assert.equal(status, 200);
    assert.deepEqual(
      (body.items as MapItem[]).map((item) => item.title),
      ['校園地圖運動'],
    );
  });

  test('沒有符合條件的活動時仍回傳校園中心點', async () => {
    const { status, body } = await getMapEvents('?from=2099-12-01&to=2099-12-31');
    assert.equal(status, 200);
    assert.deepEqual(body.items, []);
    assert.deepEqual(body.campus, CAMPUS_CENTER);
  });

  test('拒絕不合法的日期、日期範圍與類別篩選值', async () => {
    assert.equal((await getMapEvents('?from=2099-02-30')).status, 400);
    assert.equal((await getMapEvents('?to=2099-3-1')).status, 400);
    const reversed = await getMapEvents('?from=2099-03-03&to=2099-03-02');
    assert.equal(reversed.status, 400);
    assert.equal(reversed.body.error, 'invalid_date_range');
    assert.equal((await getMapEvents('?category=invalid')).status, 400);
  });
});

describe('GET /api/map/events/:eventId/location（US-03）', () => {
  test('依已發布活動的地點回傳對應建物與座標', async () => {
    const eventId = getEventId('校園地圖講座');
    const response = await fetch(`${baseUrl}/api/map/events/${eventId}/location`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      coordinates: placeCoordinates('食品科學學系館'),
      placeName: '食品科學學系館',
    });
  });

  test('沒有地點或對不到建物時回傳 null，不存在的活動回 404', async () => {
    for (const title of ['沒有地點的活動', '無法定位的活動']) {
      const response = await fetch(`${baseUrl}/api/map/events/${getEventId(title)}/location`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { coordinates: null, placeName: null });
    }
    assert.equal((await fetch(`${baseUrl}/api/map/events/99999/location`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/map/events/abc/location`)).status, 404);
  });
});
