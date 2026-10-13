import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mock, test } from 'node:test';
import { migrate, getDb, closeDb } from '../../db/index.js';
import { seedSources } from '../sources/sources.testHelpers.js';
import { IngestionService, IngestionError, getIngestionService } from './ingestion.service.js';
import { ScraperClient, scrapeAnnouncements } from './ingestion.scraper.js';
import { startIngestionScheduler } from './ingestion.scheduler.js';
import { scraperConfigs, type ScraperConfig } from './ingestion.config.js';
import { processAnnouncement } from '../events/events.service.js';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { ingestionRouter } from './ingestion.router.js';

process.env.DATABASE_PATH = ':memory:';

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
  const db = getDb();
  migrate(db);
  seedSources(db, 1);
  db.exec(
    "INSERT INTO ingestion_runs(source_id, started_at, finished_at, status, inserted_count, updated_count, error_message) VALUES (1, '2026-10-13T00:00:00Z', '2026-10-13T00:01:00Z', 'failure', 2, 1, '整理失敗')",
  );
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
      const invalid = await fetch(base + path.replace('/1/', '/bad/'), {
        method,
        headers: { 'x-test-role': 'admin' },
      });
      assert.equal(invalid.status, 400);
      assert.deepEqual(await invalid.json(), {
        error: 'invalid_source_id',
        message: '來源識別碼必須為正整數',
      });
    }
    const headers = { 'x-test-role': 'admin' };
    for (const [id, status, error, message] of [
      [999, 404, 'not_found', '找不到來源'],
      [1, 409, 'source_not_eligible', '來源尚未核准或已停用'],
    ] as const) {
      const response = await fetch(`${base}/${id}/fetch`, { method: 'POST', headers });
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { error, message });
    }
    const response = await fetch(`${base}/1/runs`, { headers });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      runs: [
        {
          id: 1,
          sourceId: 1,
          startedAt: '2026-10-13T00:00:00Z',
          finishedAt: '2026-10-13T00:01:00Z',
          status: 'failure',
          insertedCount: 2,
          updatedCount: 1,
          errorMessage: '整理失敗',
        },
      ],
    });
    const busy = mock.method(getIngestionService(), 'runSource', async () => {
      throw new IngestionError('already_running', '來源正在擷取中', 409);
    });
    try {
      const response = await fetch(`${base}/1/fetch`, { method: 'POST', headers });
      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), {
        error: 'already_running',
        message: '來源正在擷取中',
      });
    } finally {
      busy.mock.restore();
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    closeDb();
  }
});

test('發布日期取自列表同一列，詳細頁無日期仍正確，缺日期不借用其他列', async () => {
  const datedConfig = { ...config, listItemSelector: '.d-item', publishedSelector: '.mdate' };
  const client = new ScraperClient(
    async (input) =>
      new Response(
        String(input).endsWith('robots.txt')
          ? ''
          : String(input) === config.listUrl
            ? '<div class="d-item"><a href="/a">A</a><i class="mdate after">2026-10-07</i></div><div class="d-item"><a href="/b">B</a><i class="mdate after">2025-12-31</i></div><div class="d-item"><a href="/c">C</a></div><div class="d-item"><a href="/d">D</a><i class="mdate">日期未知</i></div>'
            : '<h1>AI 講座</h1><article>活動日期：1月2日</article>',
      ),
    0,
  );
  const raws = [];
  for await (const raw of scrapeAnnouncements(1, datedConfig, client)) raws.push(raw);
  assert.deepEqual(
    raws.map((raw) => [raw.url, raw.publishedAt]),
    [
      ['https://example.com/a', '2026-10-07'],
      ['https://example.com/b', '2025-12-31'],
      ['https://example.com/c', null],
      ['https://example.com/d', null],
    ],
  );
});

test('單則持續整理失敗不阻塞其他公告或下一輪新公告，錯誤保留在紀錄', async () => {
  const db = setup();
  try {
    db.exec("UPDATE sources SET review_status='approved'");
    let round = 0;
    const service = new IngestionService(
      db,
      [config],
      new ScraperClient(),
      async function* (id) {
        round++;
        for (const slug of ['bad', `good-${round}`])
          yield {
            sourceId: id,
            url: `https://example.com/${slug}`,
            title: 'AI 講座',
            rawContent: '活動日期：2026年10月15日',
            publishedAt: null,
            fetchedAt: new Date().toISOString(),
          };
      },
      (database, raw) => {
        if (raw.url?.endsWith('/bad')) throw new Error('持續整理失敗');
        return processAnnouncement(database, raw);
      },
    );
    for (let i = 0; i < 2; i++) {
      const run = await service.runSource(1);
      assert.equal(run.status, 'failure');
      assert.match(run.errorMessage!, /https:\/\/example.com\/bad：持續整理失敗/);
    }
    assert.equal(db.prepare('SELECT count(*) AS n FROM events').get()!.n, 2);
    assert.equal(db.prepare('SELECT count(*) AS n FROM raw_announcements').get()!.n, 3);
    assert.equal(
      db
        .prepare("SELECT processed_at FROM raw_announcements WHERE url='https://example.com/bad'")
        .get()!.processed_at,
      null,
    );
  } finally {
    db.close();
  }
});

test('同一來源重疊執行回傳 already_running', async () => {
  const db = setup();
  let release: () => void = () => {};
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  db.exec("UPDATE sources SET review_status='approved'");
  const service = new IngestionService(db, [config], new ScraperClient(), async function* () {
    await wait;
    yield* [];
  });
  const first = service.runSource(1);
  try {
    await assert.rejects(
      service.runSource(1),
      (error: unknown) =>
        error instanceof IngestionError && error.code === 'already_running' && error.status === 409,
    );
  } finally {
    release();
    await first;
    db.close();
  }
});

test('正式選擇器將列表發布日期存入資料庫，US-19 依該年份推論，日期更新保持同一筆', async () => {
  for (const scraperConfig of scraperConfigs) {
    const db = setup();
    try {
      db.prepare("UPDATE sources SET url=?, review_status='approved' WHERE id=1").run(
        scraperConfig.listUrl,
      );
      let publishedAt = '2024-10-07';
      const client = new ScraperClient(
        async (input) =>
          new Response(
            String(input).endsWith('robots.txt')
              ? ''
              : String(input) === scraperConfig.listUrl
                ? `<div class="module-rcglist"><div class="d-item"><div class="mbox"><div class="d-txt"><div class="mtitle"><a href="/p/406-test">公告</a></div><i class="mdate after">${publishedAt}</i></div></div></div></div>`
                : '<div class="module-detail"><h1 class="hdline">AI 講座</h1><div class="mpgdetail"><p>活動日期：10月15日</p></div></div>',
          ),
        0,
      );
      const service = new IngestionService(db, [scraperConfig], client);
      const first = await service.runSource(1);
      assert.equal(first.status, 'success');
      assert.equal(first.insertedCount, 1);
      const raw = db.prepare('SELECT * FROM raw_announcements').get()!;
      assert.equal(raw.published_at, '2024-10-07');
      assert.match(String(raw.fetched_at), /^\d{4}-\d{2}-\d{2}T.*Z$/);
      assert.ok(raw.processed_at);
      assert.equal(
        db.prepare('SELECT start_time FROM events').get()!.start_time,
        '2024-10-15T00:00:00+08:00',
      );
      const duplicate = await service.runSource(1);
      assert.equal(duplicate.insertedCount, 0);
      assert.equal(duplicate.updatedCount, 0);
      publishedAt = '2025-10-07';
      const updated = await service.runSource(1);
      assert.equal(updated.updatedCount, 1);
      assert.equal(db.prepare('SELECT id FROM raw_announcements').get()!.id, raw.id);
      assert.equal(db.prepare('SELECT count(*) AS n FROM raw_announcements').get()!.n, 1);
      assert.equal(db.prepare('SELECT count(*) AS n FROM events').get()!.n, 1);
      assert.equal(
        db.prepare('SELECT start_time FROM events').get()!.start_time,
        '2025-10-15T00:00:00+08:00',
      );
      const run = db.prepare('SELECT * FROM ingestion_runs ORDER BY id DESC LIMIT 1').get()!;
      assert.equal(run.status, 'success');
      assert.ok(run.started_at);
      assert.ok(run.finished_at);
      assert.equal(run.updated_count, 1);
    } finally {
      db.close();
    }
  }
});
