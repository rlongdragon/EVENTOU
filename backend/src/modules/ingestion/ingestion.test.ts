import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { migrate } from '../../db/index.js';
import { seedSources } from '../sources/sources.testHelpers.js';
import { IngestionService } from './ingestion.service.js';
import { ScraperClient, scrapeAnnouncements } from './ingestion.scraper.js';
import { startIngestionScheduler } from './ingestion.scheduler.js';
import type { ScraperConfig } from './ingestion.config.js';
import { processAnnouncement } from '../events/events.service.js';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { ingestionRouter } from './ingestion.router.js';

const config: ScraperConfig = {
  listUrl: 'https://example.com/source-1',
  linkSelector: 'a',
  titleSelector: 'h1',
  contentSelector: 'article',
  maxAnnouncements: 20,
};
function setup(count = 1) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  migrate(db);
  seedSources(db, count);
  return db;
}
test('只擷取核准且啟用的來源，停用後不再擷取，錯誤不影響其他來源', async () => {
  const db = setup(5);
  try {
    db.exec(
      "UPDATE sources SET review_status='approved' WHERE id IN (1,2,3); UPDATE sources SET enabled=0 WHERE id=3; UPDATE sources SET review_status='rejected' WHERE id=4;",
    );
    const calls: number[] = [];
    const service = new IngestionService(
      db,
      [config, { ...config, listUrl: 'https://example.com/source-2' }],
      new ScraperClient(),
      async function* (id) {
        calls.push(id);
        if (id === 1) throw new Error('連線失敗');
        yield {
          sourceId: id,
          url: 'https://example.com/detail',
          title: 'AI 講座',
          rawContent: '活動日期：2026年10月15日',
          publishedAt: null,
          fetchedAt: '2026-10-13T00:00:00Z',
        };
      },
    );
    await service.runAll();
    assert.deepEqual(calls, [1, 2]);
    assert.equal(db.prepare('SELECT count(*) AS n FROM raw_announcements').get()!.n, 1);
    const runs = db.prepare('SELECT * FROM ingestion_runs ORDER BY id').all();
    assert.equal(runs[0].status, 'failure');
    assert.equal(runs[0].error_message, '連線失敗');
    assert.equal(runs[1].status, 'success');
    db.exec('UPDATE sources SET enabled=0 WHERE id=2');
    await service.runAll();
    assert.deepEqual(calls, [1, 2, 1]);
    await assert.rejects(service.runSource(2), /停用/);
  } finally {
    db.close();
  }
});
test('重複公告保持同一筆，內容更新後更新 Event', async () => {
  const db = setup();
  try {
    db.exec("UPDATE sources SET review_status='approved'");
    let title = 'AI 講座';
    const service = new IngestionService(db, [config], new ScraperClient(), async function* (id) {
      yield {
        sourceId: id,
        url: 'https://example.com/detail',
        title,
        rawContent: '活動日期：2026年10月15日',
        publishedAt: null,
        fetchedAt: new Date().toISOString(),
      };
    });
    assert.equal((await service.runSource(1)).insertedCount, 1);
    assert.equal((await service.runSource(1)).insertedCount, 0);
    title = '更新 AI 講座';
    assert.equal((await service.runSource(1)).updatedCount, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM raw_announcements').get()!.n, 1);
    assert.equal(db.prepare('SELECT title FROM events').get()!.title, title);
  } finally {
    db.close();
  }
});
test('robots 禁止的頁面不請求，暫時錯誤會重試', async () => {
  const calls: string[] = [];
  let attempts = 0;
  const client = new ScraperClient(
    async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('robots.txt')) return new Response('User-agent: *\nDisallow: /blocked');
      attempts++;
      return attempts === 1 ? new Response('', { status: 503 }) : new Response('ok');
    },
    0,
    100,
    1,
  );
  await assert.rejects(client.get('https://example.com/blocked'), /robots/);
  assert.equal(calls.length, 1);
  assert.equal(await client.get('https://example.com/allowed'), 'ok');
  assert.equal(attempts, 2);
});
test('列表去重、抓取內文、結構改變回報失敗', async () => {
  const client = new ScraperClient(
    async (input) =>
      new Response(
        String(input).endsWith('robots.txt')
          ? ''
          : String(input) === config.listUrl
            ? '<a href="/detail">A</a><a href="/detail">B</a>'
            : '<h1>講座</h1><article><p>原文</p></article>',
      ),
    0,
  );
  const raws = [];
  for await (const raw of scrapeAnnouncements(1, config, client)) raws.push(raw);
  assert.equal(raws.length, 1);
  assert.equal(raws[0].rawContent, '<p>原文</p>');
  const broken = new ScraperClient(async () => new Response(''), 0);
  await assert.rejects(async () => {
    for await (const raw of scrapeAnnouncements(1, config, broken)) void raw;
  }, /頁面結構/);
});
test('排程自動重複執行且不重疊，停止後不再觸發', async () => {
  let count = 0;
  let release: () => void = () => {};
  const stop = startIngestionScheduler(async () => {
    count++;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  }, 10);
  try {
    await new Promise((resolve) => setTimeout(resolve, 35));
    assert.equal(count, 1);
    release();
    await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(count, 2);
  } finally {
    stop();
    release();
  }
});

test('整理失敗保留原始公告，下次重試成功且不新增第二筆', async () => {
  const db = setup();
  try {
    db.exec("UPDATE sources SET review_status='approved'");
    let fail = true;
    const service = new IngestionService(
      db,
      [config],
      new ScraperClient(),
      async function* (id) {
        yield {
          sourceId: id,
          url: 'https://example.com/detail',
          title: 'AI 講座',
          rawContent: '活動日期：2026年10月15日',
          publishedAt: null,
          fetchedAt: new Date().toISOString(),
        };
      },
      (database, raw) => {
        if (fail) throw new Error('整理失敗');
        return processAnnouncement(database, raw);
      },
    );
    assert.equal((await service.runSource(1)).status, 'failure');
    assert.equal(
      db.prepare('SELECT processed_at FROM raw_announcements').get()!.processed_at,
      null,
    );
    fail = false;
    assert.equal((await service.runSource(1)).status, 'success');
    assert.equal(db.prepare('SELECT count(*) AS n FROM raw_announcements').get()!.n, 1);
    assert.ok(db.prepare('SELECT processed_at FROM raw_announcements').get()!.processed_at);
  } finally {
    db.close();
  }
});

test('手動入口與紀錄只允許管理員，並驗證來源識別碼', async () => {
  const app = express();
  app.use((req, _res, next) => {
    if (req.headers['x-test-role'])
      req.user = {
        id: 1,
        email: 'test@example.com',
        displayName: '測試',
        createdAt: '2026-10-13T00:00:00Z',
        role: req.headers['x-test-role'] === 'admin' ? 'admin' : 'user',
      };
    next();
  });
  app.use('/api/ingestion', ingestionRouter);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://localhost:${(server.address() as AddressInfo).port}/api/ingestion`;
  try {
    for (const [method, path] of [
      ['POST', '/1/fetch'],
      ['GET', '/1/runs'],
    ]) {
      assert.equal((await fetch(base + path, { method })).status, 401);
      assert.equal(
        (await fetch(base + path, { method, headers: { 'x-test-role': 'user' } })).status,
        403,
      );
      assert.equal(
        (
          await fetch(base + path.replace('/1/', '/bad/'), {
            method,
            headers: { 'x-test-role': 'admin' },
          })
        ).status,
        400,
      );
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
