import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../../app.js';
import { closeDb, getDb, migrate } from '../../db/index.js';
import { setUserRole } from '../auth/auth.service.js';
import { assessSourceRisk, riskLevelForScore, type RiskInput } from './sources.risk.js';

process.env.DATABASE_PATH = ':memory:';

const base: RiskInput = {
  url: 'https://csie.example.edu/news',
  reviewStatus: 'approved',
  enabled: true,
  recentRunStatuses: ['success', 'success', 'success'],
};

const codes = (input: Partial<RiskInput>) =>
  assessSourceRisk({ ...base, ...input }).reasons.map((reason) => reason.code);

describe('assessSourceRisk（規則）', () => {
  test('已核准、啟用中、HTTPS、擷取都成功：低風險且沒有原因', () => {
    const risk = assessSourceRisk(base);
    assert.equal(risk.level, 'low');
    assert.equal(risk.score, 0);
    assert.deepEqual(risk.reasons, []);
  });

  test('等級門檻：0–19 低、20–49 中、50 以上高', () => {
    assert.equal(riskLevelForScore(19), 'low');
    assert.equal(riskLevelForScore(20), 'medium');
    assert.equal(riskLevelForScore(49), 'medium');
    assert.equal(riskLevelForScore(50), 'high');
  });

  test('檢查審核狀態：待審核為中風險，已退回為高風險', () => {
    const pending = assessSourceRisk({ ...base, reviewStatus: 'pending', recentRunStatuses: [] });
    assert.deepEqual(
      pending.reasons.map((r) => r.code),
      ['review_pending'],
    );
    assert.equal(pending.level, 'medium');

    const rejected = assessSourceRisk({ ...base, reviewStatus: 'rejected', recentRunStatuses: [] });
    assert.deepEqual(
      rejected.reasons.map((r) => r.code),
      ['review_rejected'],
    );
    assert.equal(rejected.level, 'high');
  });

  test('檢查啟用狀態與 HTTPS', () => {
    assert.deepEqual(codes({ enabled: false }), ['disabled']);
    assert.deepEqual(codes({ url: 'http://csie.example.edu/news' }), ['not_https']);
    assert.equal(assessSourceRisk({ ...base, url: 'http://csie.example.edu' }).level, 'medium');
  });

  test('已核准但沒有擷取紀錄：提示無法確認可存取性，仍為低風險', () => {
    const risk = assessSourceRisk({ ...base, recentRunStatuses: [] });
    assert.deepEqual(
      risk.reasons.map((r) => r.code),
      ['no_ingestion_history'],
    );
    assert.equal(risk.level, 'low');
  });

  test('依過去擷取結果判斷異常', () => {
    assert.deepEqual(codes({ recentRunStatuses: ['failure', 'success', 'success'] }), [
      'latest_run_failed',
      'elevated_failure_rate',
    ]);
    assert.deepEqual(codes({ recentRunStatuses: ['failure', 'failure', 'success', 'success'] }), [
      'latest_run_failed',
      'high_failure_rate',
    ]);

    const down = assessSourceRisk({ ...base, recentRunStatuses: Array(10).fill('failure') });
    assert.deepEqual(
      down.reasons.map((r) => r.code),
      ['consecutive_failures', 'high_failure_rate'],
    );
    assert.equal(down.level, 'high');
    assert.equal(down.recentFailures, 10);
  });

  test('失敗率只看最近 10 次，且至少 3 次才判斷', () => {
    assert.deepEqual(codes({ recentRunStatuses: ['success', 'failure'] }), []);
    const old = [...Array(10).fill('success'), ...Array(10).fill('failure')];
    const risk = assessSourceRisk({ ...base, recentRunStatuses: old });
    assert.equal(risk.recentRuns, 10);
    assert.deepEqual(risk.reasons, []);
  });

  test('未核准的來源不套用擷取規則；原因依分數由高到低排列', () => {
    assert.deepEqual(
      codes({
        reviewStatus: 'pending',
        url: 'http://club.example.com',
        recentRunStatuses: ['failure', 'failure', 'failure'],
      }),
      ['review_pending', 'not_https'],
    );
  });
});

let server: Server;
let baseUrl: string;

before(async () => {
  migrate();
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  closeDb();
});

async function request(method: string, path: string, cookie?: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const setCookie = response.headers.getSetCookie()[0]?.split(';')[0];
  return { status: response.status, body: text ? JSON.parse(text) : undefined, setCookie };
}

async function register(email: string, admin = false): Promise<string> {
  await request('POST', '/api/auth/register', undefined, {
    email,
    password: 'password123',
    displayName: email.split('@')[0],
  });
  if (admin) assert.equal(setUserRole(email, 'admin'), true);
  const login = await request('POST', '/api/auth/login', undefined, {
    email,
    password: 'password123',
  });
  assert.ok(login.setCookie);
  return login.setCookie;
}

function insertSource(url: string, reviewStatus: string, enabled = 1): number {
  const row = getDb()
    .prepare(
      `INSERT INTO sources (name, url, type, submitted_by, review_status, enabled)
       VALUES ('風險測試', ?, 'other', 1, ?, ?) RETURNING id`,
    )
    .get(url, reviewStatus, enabled) as { id: number };
  return row.id;
}

function insertRuns(sourceId: number, statuses: string[]): void {
  const insert = getDb().prepare(
    "INSERT INTO ingestion_runs (source_id, started_at, status) VALUES (?, datetime('now'), ?)",
  );
  // 依序插入，最後一筆是最新的
  for (const status of statuses) insert.run(sourceId, status);
}

describe('來源風險 API', () => {
  test('管理員可看到風險等級、分數與主要原因，且不改變審核與啟用狀態', async () => {
    const adminCookie = await register('risk-admin@example.com', true);
    const id = insertSource('http://broken.example.com', 'approved');
    insertRuns(id, ['success', 'failure', 'failure', 'failure', 'running']);

    const result = await request('GET', `/api/sources/${id}/risk`, adminCookie);
    assert.equal(result.status, 200);
    assert.equal(result.body.risk.level, 'high');
    assert.deepEqual(
      result.body.risk.reasons.map((r: { code: string }) => r.code),
      ['consecutive_failures', 'not_https', 'high_failure_rate'],
    );
    assert.equal(result.body.risk.recentRuns, 4);

    const list = await request('GET', '/api/sources?status=approved', adminCookie);
    const listed = list.body.sources.find((s: { id: number }) => s.id === id);
    assert.equal(listed.risk.level, 'high');
    assert.ok(listed.risk.reasons.length > 0);
    assert.equal(listed.reviewStatus, 'approved');
    assert.equal(listed.enabled, true);
  });

  test('一般使用者與訪客只看到已核准來源的風險等級，看不到原因', async () => {
    const userCookie = await register('risk-user@example.com');
    const approved = insertSource('https://ok.example.com', 'approved');
    const pending = insertSource('https://pending.example.com', 'pending');

    const asUser = await request('GET', `/api/sources/${approved}/risk`, userCookie);
    assert.equal(asUser.status, 200);
    assert.deepEqual(asUser.body.risk, { level: 'low' });

    const asGuest = await request('GET', `/api/sources/${approved}/risk`);
    assert.deepEqual(asGuest.body.risk, { level: 'low' });

    assert.equal((await request('GET', `/api/sources/${pending}/risk`, userCookie)).status, 404);

    const list = await request('GET', '/api/sources');
    const listed = list.body.sources.find((s: { id: number }) => s.id === approved);
    assert.deepEqual(listed.risk, { level: 'low' });
  });

  test('找不到或 id 不正確回傳 404', async () => {
    const adminCookie = await register('risk-admin2@example.com', true);
    assert.equal((await request('GET', '/api/sources/99999/risk', adminCookie)).status, 404);
    assert.equal((await request('GET', '/api/sources/abc/risk', adminCookie)).status, 404);
  });
});
