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
let nominatimRequests = 0;
const originalFetch = globalThis.fetch;

before(async () => {
  globalThis.fetch = (async (input) => {
    if (String(input).startsWith('https://nominatim.openstreetmap.org/')) {
      nominatimRequests += 1;
      return new Response(JSON.stringify([{ lat: '25.15', lon: '121.77' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return originalFetch(input);
  }) as typeof fetch;

  migrate();
  seedSources(getDb());
  const base: RawAnnouncement = {
    sourceId: 1,
    url: 'https://example.com/location-map-event-1',
    title: '有地點的地圖測試活動',
    rawContent: '活動日期：2099/03/02 14:00-16:00\n地點：測試會場',
    publishedAt: '2099-02-01T09:00:00+08:00',
    fetchedAt: '2099-02-01T09:01:00+08:00',
  };
  processAnnouncement(getDb(), base, { defaultCategory: 'lecture' });
  processAnnouncement(
    getDb(),
    {
      ...base,
      url: 'https://example.com/location-map-event-2',
      title: '沒有地點的地圖測試活動',
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

function getEventId(title: string): number {
  const row = getDb().prepare('SELECT id FROM published_events WHERE title = ?').get(title) as
    { id: number } | undefined;
  assert.ok(row);
  return Number(row.id);
}

describe('GET /api/map/events/:eventId/location（US-03）', () => {
  test('只依已發布活動的資料查詢座標，並共用序列化 geocode 服務', async () => {
    const eventId = getEventId('有地點的地圖測試活動');
    const response = await fetch(`${baseUrl}/api/map/events/${eventId}/location`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      coordinates: { latitude: 25.15, longitude: 121.77 },
    });
    assert.equal(nominatimRequests, 1);
  });

  test('沒有地點或不存在的活動不會呼叫 Nominatim，且不接受任意字串查詢', async () => {
    const beforeRequests = nominatimRequests;
    const noLocationId = getEventId('沒有地點的地圖測試活動');
    const noLocationResponse = await fetch(`${baseUrl}/api/map/events/${noLocationId}/location`);
    assert.equal(noLocationResponse.status, 200);
    assert.deepEqual(await noLocationResponse.json(), { coordinates: null });
    assert.equal((await fetch(`${baseUrl}/api/map/events/99999/location`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/map/geocode?location=任意字串`)).status, 404);
    assert.equal(nominatimRequests, beforeRequests);
  });
});
