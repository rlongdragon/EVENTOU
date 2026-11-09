import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../../app.js';
import { closeDb, getDb, migrate } from '../../db/index.js';
import { processAnnouncement } from '../events/events.service.js';
import type { RawAnnouncement } from '../events/events.types.js';
import { seedSources } from '../sources/sources.testHelpers.js';

process.env.DATABASE_PATH = ':memory:';

let server: Server;
let baseUrl: string;
const originalFetch = globalThis.fetch;

before(async () => {
  globalThis.fetch = (async (input, init) => {
    if (String(input).startsWith('https://nominatim.openstreetmap.org/')) {
      return new Response(JSON.stringify([{ lat: '25.15', lon: '121.77' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  migrate();
  seedSources(getDb());
  const base: RawAnnouncement = {
    sourceId: 1,
    url: 'https://example.com/map-event-1',
    title: '校園地圖講座',
    rawContent: '活動日期：2099/03/02 14:00-16:00\n地點：測試會場',
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
      rawContent: '活動日期：2099/03/03 14:00-16:00\n地點：測試會場',
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

  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  closeDb();
  globalThis.fetch = originalFetch;
});

async function getMapEvents(query = '') {
  const response = await fetch(`${baseUrl}/api/map/events${query}`);
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('GET /api/map/events（US-04）', () => {
  test('訪客可取得所有已發布且有地點的活動與座標', async () => {
    const { status, body } = await getMapEvents();
    assert.equal(status, 200);
    const items = body.items as {
      title: string;
      location: string;
      categoryLabel: string;
      coordinates: { latitude: number; longitude: number } | null;
    }[];
    assert.equal(items.length, 2);
    assert.equal(items[0].title, '校園地圖講座');
    assert.equal(items[0].location, '測試會場');
    assert.equal(items[0].categoryLabel, '講座');
    assert.deepEqual(items[0].coordinates, { latitude: 25.15, longitude: 121.77 });
    assert.ok(Array.isArray(body.categories));
  });

  test('可同時依台北日期與類別篩選，且不登入也能使用', async () => {
    const { status, body } = await getMapEvents('?date=2099-03-02&category=lecture');
    assert.equal(status, 200);
    const items = body.items as { title: string }[];
    assert.deepEqual(
      items.map((item) => item.title),
      ['校園地圖講座'],
    );
  });

  test('拒絕不合法的日期與類別篩選值', async () => {
    assert.equal((await getMapEvents('?date=2099-02-30')).status, 400);
    assert.equal((await getMapEvents('?category=invalid')).status, 400);
  });
});
