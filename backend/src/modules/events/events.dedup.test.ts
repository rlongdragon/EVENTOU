import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, test } from 'node:test';
import { createApp } from '../../app.js';
import { closeDb, getDb, migrate } from '../../db/index.js';
import { setUserRole } from '../auth/auth.service.js';
import { seedSources } from '../sources/sources.testHelpers.js';
import {
  classifyScore,
  dedupConfig,
  DEFAULT_DEDUP_CONFIG,
  normalizeForMatch,
  scoreDuplicate,
  titleSimilarity,
  type DedupFields,
  type DuplicatePair,
} from './events.dedup.js';
import { processAnnouncement } from './events.service.js';

process.env.DATABASE_PATH = ':memory:';

describe('重複分數（US-20）', () => {
  test('標題正規化去掉標點、括號與空白，全形轉半形', () => {
    assert.equal(
      normalizeForMatch('【轉知】ＮＴＯＵ　Hackathon（2026）！'),
      '轉知ntouhackathon2026',
    );
  });

  test('標題相似度為字元 bigram Jaccard', () => {
    assert.equal(titleSimilarity('海洋講座', '【海洋講座】'), 1);
    assert.equal(titleSimilarity('海洋講座', '運動會'), 0);
    // {海洋, 洋講, 講座} 與 {海洋, 洋文, 文學, 學講, 講座} 共有 2 個
    assert.equal(titleSimilarity('海洋講座', '海洋文學講座'), 2 / 6);
    assert.equal(titleSimilarity('', '海洋講座'), 0);
  });

  const base: DedupFields = {
    title: '海洋科技就業博覽會',
    startTime: '2026-11-18T10:00:00+08:00',
    location: '體育館',
    registrationUrl: null,
  };

  test('報名連結相同直接判定重複（忽略 hash 與結尾斜線）', () => {
    const result = scoreDuplicate(
      { ...base, title: '長榮海運說明會', registrationUrl: 'https://forms.example.com/a/' },
      { ...base, title: '企業徵才', registrationUrl: 'https://forms.example.com/a#top' },
    );
    assert.equal(result.sameRegistrationUrl, true);
    assert.equal(result.score, 1);
  });

  test('標題相似且開始時間相同時判定重複；開始時間不同最多只是可能重複', () => {
    const same = scoreDuplicate(base, { ...base, title: '【轉知】海洋科技就業博覽會' });
    assert.equal(classifyScore(same.score, DEFAULT_DEDUP_CONFIG), 'merged');
    const otherTime = scoreDuplicate(base, { ...base, startTime: '2026-11-18T14:00:00+08:00' });
    assert.equal(otherTime.sameStartTime, false);
    assert.equal(classifyScore(otherTime.score, DEFAULT_DEDUP_CONFIG), 'possible');
  });

  test('門檻可用環境變數設定，不合法時使用預設值', () => {
    assert.deepEqual(dedupConfig({}), DEFAULT_DEDUP_CONFIG);
    assert.deepEqual(dedupConfig({ DEDUP_HIGH_THRESHOLD: '0.9', DEDUP_LOW_THRESHOLD: '0.6' }), {
      highThreshold: 0.9,
      lowThreshold: 0.6,
    });
    assert.deepEqual(dedupConfig({ DEDUP_HIGH_THRESHOLD: '2' }), DEFAULT_DEDUP_CONFIG);
    // 低門檻大於高門檻
    assert.deepEqual(
      dedupConfig({ DEDUP_HIGH_THRESHOLD: '0.4', DEDUP_LOW_THRESHOLD: '0.6' }),
      DEFAULT_DEDUP_CONFIG,
    );
  });

  test('標記配對驗證（NFR-09）：自動合併的 precision 需達 90% 以上', () => {
    const { pairs } = JSON.parse(
      readFileSync(new URL('./fixtures/duplicate-pairs.json', import.meta.url), 'utf8'),
    ) as { pairs: { duplicate: boolean; a: DedupFields; b: DedupFields }[] };
    assert.ok(pairs.length >= 30);
    let merged = 0;
    let correctMerged = 0;
    let detected = 0;
    const duplicates = pairs.filter((pair) => pair.duplicate).length;
    for (const pair of pairs) {
      const status = classifyScore(scoreDuplicate(pair.a, pair.b).score, DEFAULT_DEDUP_CONFIG);
      if (status === 'merged') {
        merged += 1;
        if (pair.duplicate) correctMerged += 1;
      }
      if (status !== 'none' && pair.duplicate) detected += 1;
    }
    const precision = correctMerged / merged;
    // 結果記錄在 docs/dedup.md；調整權重或預設門檻時請一併更新
    assert.ok(precision >= 0.9, `precision ${precision}`);
    assert.equal(correctMerged / duplicates, 12 / 18, '自動合併 recall');
    assert.equal(detected / duplicates, 1, '合併或標記可能重複的 recall');
  });
});

const reference = '2026-10-01T09:00:00+08:00';

function announce(
  sourceId: number,
  url: string,
  title: string,
  details = '活動日期：2026/10/07 14:00-16:00\n地點：甲子廳',
) {
  return processAnnouncement(
    getDb(),
    {
      sourceId,
      url,
      title,
      rawContent: details,
      publishedAt: reference,
      fetchedAt: reference,
    },
    { defaultCategory: 'lecture' },
  );
}

function publishedIds(): number[] {
  return getDb()
    .prepare('SELECT id FROM published_events ORDER BY id')
    .all()
    .map((row) => Number(row.id));
}

let server: Server;
let baseUrl: string;
let adminCookie: string;
let userCookie: string;

async function register(email: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'password123', displayName: email.split('@')[0] }),
  });
  const cookie = response.headers.getSetCookie()[0]?.split(';')[0];
  assert.ok(cookie);
  return cookie;
}

async function request(method: string, path: string, cookie?: string) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: cookie ? { Cookie: cookie } : {},
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

before(async () => {
  migrate();
  const db = getDb();
  seedSources(db, 4); // 來源 1–3 核准，來源 4 待審核
  db.prepare("UPDATE sources SET review_status = 'approved' WHERE id IN (1, 2, 3)").run();
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
  adminCookie = await register('dedup-admin@example.com');
  assert.equal(setUserRole('dedup-admin@example.com', 'admin'), true);
  userCookie = await register('dedup-user@example.com');
});

after(() => {
  server.close();
  closeDb();
});

beforeEach(() => {
  const db = getDb();
  db.exec('DELETE FROM event_distinct_pairs');
  db.exec('UPDATE events SET duplicate_of = NULL');
  db.exec('DELETE FROM events');
});

describe('寫入時偵測重複（US-20）', () => {
  test('不同來源的同一活動自動合併，不出現在 published_events，活動頁列出所有來源', async () => {
    // 搜尋只列出尚未結束的活動，所以用未來的日期
    const future = '活動日期：2026/12/07 14:00-16:00\n地點：甲子廳';
    const kept = announce(1, 'https://a.example.com/1', '海洋科技就業博覽會', future);
    const duplicate = announce(2, 'https://b.example.com/1', '【轉知】海洋科技就業博覽會', future);
    assert.equal(kept.dedup.status, 'none');
    assert.deepEqual(duplicate.dedup, { status: 'merged', duplicateOf: kept.id, score: 0.88 });
    assert.deepEqual(publishedIds(), [kept.id]);

    const detail = await request('GET', `/api/events/${kept.id}`);
    assert.deepEqual(
      detail.body.event.sources.map((source: { originalUrl: string }) => source.originalUrl),
      ['https://a.example.com/1', 'https://b.example.com/1'],
    );
    assert.equal((await request('GET', `/api/events/${duplicate.id}`)).status, 404);
    // 搜尋也不會列出合併掉的那筆
    const search = await request('GET', '/api/events?q=博覽會');
    assert.deepEqual(
      search.body.items.map((item: { id: number }) => item.id),
      [kept.id],
    );
  });

  test('保留的那筆缺地點時以合併進來的資料補上，原始資料不改', () => {
    const kept = announce(
      1,
      'https://a.example.com/2',
      '海洋文學獎頒獎典禮',
      '活動日期：2026/10/07 14:00-16:00',
    );
    announce(2, 'https://b.example.com/2', '海洋文學獎頒獎典禮');
    const db = getDb();
    assert.equal(
      db.prepare('SELECT location FROM published_events WHERE id = ?').get(kept.id)?.location,
      '甲子廳',
    );
    assert.equal(
      db.prepare('SELECT location FROM events WHERE id = ?').get(kept.id)?.location,
      null,
    );
  });

  test('報名連結相同時直接判定重複', () => {
    const kept = announce(
      1,
      'https://a.example.com/3',
      '長榮海運企業說明會',
      '活動日期：2026/10/07 12:00-13:00\n報名連結：https://forms.example.com/evergreen',
    );
    const duplicate = announce(
      2,
      'https://b.example.com/3',
      '校園徵才：長榮',
      '活動日期：2026/10/07 12:10-13:00\n報名連結：https://forms.example.com/evergreen',
    );
    assert.equal(duplicate.dedup.status, 'merged');
    assert.equal(duplicate.dedup.duplicateOf, kept.id);
  });

  test('中信心標記為可能重複，兩筆都照常顯示', () => {
    const first = announce(1, 'https://a.example.com/4', '國際志工服務說明會');
    const second = announce(
      2,
      'https://b.example.com/4',
      '國際志工服務說明會',
      '活動日期：2026/10/07 18:30-20:00\n地點：甲子廳',
    );
    assert.equal(second.dedup.status, 'possible');
    assert.deepEqual(publishedIds(), [first.id, second.id]);
  });

  test('只比對開始日期前後 1 天內、其他已核准來源的活動', () => {
    announce(1, 'https://a.example.com/5', '海洋講座');
    // 同一來源
    assert.equal(announce(1, 'https://a.example.com/6', '海洋講座').dedup.status, 'none');
    // 未核准來源的活動不當作比對對象
    announce(4, 'https://d.example.com/5', '運動會', '活動日期：2026/10/20 14:00-16:00');
    assert.equal(
      announce(2, 'https://b.example.com/5b', '運動會', '活動日期：2026/10/20 14:00-16:00').dedup
        .status,
      'none',
    );
    // 相差 2 天
    assert.equal(
      announce(2, 'https://b.example.com/5', '海洋講座', '活動日期：2026/10/09 14:00-16:00').dedup
        .status,
      'none',
    );
    // 相差 1 天：仍會比對（標題相同但時間不同 → 可能重複）
    assert.equal(
      announce(3, 'https://c.example.com/5', '海洋講座', '活動日期：2026/10/08 14:00-16:00').dedup
        .status,
      'possible',
    );
  });

  test('重跑擷取不會改變判定，也不會把保留的那筆合併到別的活動', () => {
    const kept = announce(1, 'https://a.example.com/7', '海洋科技就業博覽會');
    const duplicate = announce(2, 'https://b.example.com/7', '【轉知】海洋科技就業博覽會');
    announce(1, 'https://a.example.com/7', '海洋科技就業博覽會');
    const rerun = announce(2, 'https://b.example.com/7', '【轉知】海洋科技就業博覽會');
    assert.equal(rerun.id, duplicate.id);
    assert.equal(rerun.dedup.status, 'none', '已判定過的活動不再重新判定');
    const row = getDb()
      .prepare('SELECT duplicate_of, dedup_status FROM events WHERE id = ?')
      .get(duplicate.id);
    assert.deepEqual({ ...row }, { duplicate_of: kept.id, dedup_status: 'merged' });
    assert.deepEqual(publishedIds(), [kept.id]);
  });

  test('保留的那筆轉為待審時，合併掉的那筆重新顯示，活動不會消失', () => {
    announce(1, 'https://a.example.com/8', '海洋科技就業博覽會');
    const duplicate = announce(2, 'https://b.example.com/8', '【轉知】海洋科技就業博覽會');
    // 原始公告被改掉標題 → needs_review
    processAnnouncement(getDb(), {
      sourceId: 1,
      url: 'https://a.example.com/8',
      title: null,
      rawContent: '活動日期：2026/10/07 14:00-16:00',
      publishedAt: reference,
      fetchedAt: reference,
    });
    assert.deepEqual(publishedIds(), [duplicate.id]);
  });
});

describe('管理員處理重複活動（US-20）', () => {
  test('只有管理員能查看與處理', async () => {
    assert.equal((await request('GET', '/api/events/duplicates')).status, 401);
    assert.equal((await request('GET', '/api/events/duplicates', userCookie)).status, 403);
    assert.equal((await request('POST', '/api/events/duplicates/1/split', userCookie)).status, 403);
  });

  test('列出可能重複與已合併的配對，可確認合併', async () => {
    const kept = announce(1, 'https://a.example.com/9', '海洋科技就業博覽會');
    const merged = announce(2, 'https://b.example.com/9', '【轉知】海洋科技就業博覽會');
    const possible = announce(
      3,
      'https://c.example.com/9',
      '海洋科技就業博覽會',
      '活動日期：2026/10/07 09:00-12:00\n地點：體育館',
    );
    assert.equal(possible.dedup.status, 'possible');

    const list = await request('GET', '/api/events/duplicates', adminCookie);
    assert.equal(list.status, 200);
    const pairs = list.body.pairs as DuplicatePair[];
    assert.deepEqual(
      pairs.map((pair) => [pair.status, pair.event.id, pair.duplicateOf.id]),
      [
        ['possible', possible.id, kept.id],
        ['merged', merged.id, kept.id],
      ],
    );
    assert.equal(pairs[0].event.sourceName, '測試來源 3');

    const confirmed = await request(
      'POST',
      `/api/events/duplicates/${possible.id}/merge`,
      adminCookie,
    );
    assert.equal(confirmed.status, 200);
    assert.deepEqual(publishedIds(), [kept.id]);
    // 已合併的不能再「確認合併」
    assert.equal(
      (await request('POST', `/api/events/duplicates/${possible.id}/merge`, adminCookie)).status,
      404,
    );
  });

  test('誤合併可以還原成兩筆獨立活動，之後重跑擷取不會再合併', async () => {
    const kept = announce(1, 'https://a.example.com/10', '海洋科技就業博覽會');
    const duplicate = announce(2, 'https://b.example.com/10', '【轉知】海洋科技就業博覽會');
    const split = await request(
      'POST',
      `/api/events/duplicates/${duplicate.id}/split`,
      adminCookie,
    );
    assert.equal(split.status, 200);
    assert.deepEqual(split.body.pairs, []);
    assert.deepEqual(publishedIds(), [kept.id, duplicate.id]);

    const rerun = announce(2, 'https://b.example.com/10', '【轉知】海洋科技就業博覽會');
    assert.equal(rerun.dedup.status, 'none');
    assert.deepEqual(publishedIds(), [kept.id, duplicate.id]);
    // 不是可能重複或已合併的活動
    assert.equal(
      (await request('POST', `/api/events/duplicates/${duplicate.id}/split`, adminCookie)).status,
      404,
    );
    assert.equal(
      (await request('POST', '/api/events/duplicates/abc/split', adminCookie)).status,
      404,
    );
  });
});
