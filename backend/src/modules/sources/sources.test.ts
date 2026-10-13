import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../../app.js';
import { closeDb, getDb, migrate } from '../../db/index.js';
import { setUserRole } from '../auth/auth.service.js';

process.env.DATABASE_PATH = ':memory:';

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

async function request(
  method: string,
  path: string,
  options: { body?: unknown; cookie?: string } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.cookie ? { Cookie: options.cookie } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const cookie = response.headers.getSetCookie()[0]?.split(';')[0];
  return { status: response.status, body: text ? JSON.parse(text) : undefined, cookie };
}

async function registerUser(email: string) {
  const result = await request('POST', '/api/auth/register', {
    body: { email, password: 'password123', displayName: email.split('@')[0] },
  });
  assert.equal(result.status, 201);
  assert.ok(result.cookie);
  return { cookie: result.cookie, id: result.body.user.id as number };
}

const validSource = {
  name: '資訊工程學系公告',
  url: 'https://csie.example.edu/news',
  type: 'department_site',
};

describe('POST /api/sources', () => {
  test('訪客不能提交來源', async () => {
    const result = await request('POST', '/api/sources', { body: validSource });
    assert.equal(result.status, 401);
  });

  test('驗證必要欄位', async () => {
    const { cookie } = await registerUser('required@example.com');
    const result = await request('POST', '/api/sources', { cookie, body: {} });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'validation_error');
    assert.deepEqual(Object.keys(result.body.fields).sort(), ['name', 'type', 'url']);
  });

  test('名稱只有空白視為未填', async () => {
    const { cookie } = await registerUser('blank@example.com');
    const result = await request('POST', '/api/sources', {
      cookie,
      body: { ...validSource, name: '   ' },
    });
    assert.equal(result.status, 400);
    assert.deepEqual(Object.keys(result.body.fields), ['name']);
  });

  test('檢查網址格式', async () => {
    const { cookie } = await registerUser('badurl@example.com');
    const badUrls = [
      'not a url',
      'csie.example.edu/news',
      'ftp://csie.example.edu/news',
      'javascript:alert(1)',
      'https://user:secret@csie.example.edu/news',
    ];
    for (const url of badUrls) {
      const result = await request('POST', '/api/sources', {
        cookie,
        body: { ...validSource, url },
      });
      assert.equal(result.status, 400, url);
      assert.ok(result.body.fields.url, url);
    }
  });

  test('來源類型必須是已定義的值', async () => {
    const { cookie } = await registerUser('badtype@example.com');
    const result = await request('POST', '/api/sources', {
      cookie,
      body: { ...validSource, type: 'not_a_type' },
    });
    assert.equal(result.status, 400);
    assert.deepEqual(Object.keys(result.body.fields), ['type']);
  });

  test('提交成功後狀態為待審核，並記錄提交者與提交時間', async () => {
    const { cookie, id } = await registerUser('submit@example.com');
    const result = await request('POST', '/api/sources', {
      cookie,
      body: { ...validSource, name: `  ${validSource.name}  `, url: `  ${validSource.url}  ` },
    });
    assert.equal(result.status, 201);

    const { source } = result.body;
    assert.equal(source.name, validSource.name);
    assert.equal(source.url, validSource.url);
    assert.equal(source.type, validSource.type);
    assert.equal(source.reviewStatus, 'pending');
    assert.equal(source.submittedBy, id);
    assert.ok(source.createdAt);
  });
});

describe('GET /api/sources/mine', () => {
  test('訪客不能查看', async () => {
    assert.equal((await request('GET', '/api/sources/mine')).status, 401);
  });

  test('只看到自己提交的來源與審核狀態', async () => {
    const alice = await registerUser('alice@example.com');
    const bob = await registerUser('bob@example.com');

    const first = await request('POST', '/api/sources', {
      cookie: alice.cookie,
      body: { ...validSource, name: 'Alice 的來源 1' },
    });
    await request('POST', '/api/sources', {
      cookie: alice.cookie,
      body: { ...validSource, name: 'Alice 的來源 2' },
    });
    await request('POST', '/api/sources', {
      cookie: bob.cookie,
      body: { ...validSource, name: 'Bob 的來源' },
    });

    getDb()
      .prepare("UPDATE sources SET review_status = 'approved' WHERE id = ?")
      .run(first.body.source.id);

    const mine = await request('GET', '/api/sources/mine', { cookie: alice.cookie });
    assert.equal(mine.status, 200);
    assert.deepEqual(
      mine.body.sources.map((s: { name: string; reviewStatus: string }) => [
        s.name,
        s.reviewStatus,
      ]),
      [
        ['Alice 的來源 2', 'pending'],
        ['Alice 的來源 1', 'approved'],
      ],
    );

    const bobs = await request('GET', '/api/sources/mine', { cookie: bob.cookie });
    assert.deepEqual(
      bobs.body.sources.map((s: { name: string }) => s.name),
      ['Bob 的來源'],
    );
  });
});

describe('GET /api/sources', () => {
  test('待審核的來源只有管理員看得到，訪客與一般使用者只看到已核准的', async () => {
    const user = await registerUser('lister@example.com');
    await registerUser('boss@example.com');
    assert.equal(setUserRole('boss@example.com', 'admin'), true);
    const admin = await request('POST', '/api/auth/login', {
      body: { email: 'boss@example.com', password: 'password123' },
    });
    assert.ok(admin.cookie);

    const pending = await request('POST', '/api/sources', {
      cookie: user.cookie,
      body: { ...validSource, name: '待審核來源' },
    });
    const approved = await request('POST', '/api/sources', {
      cookie: user.cookie,
      body: { ...validSource, name: '已核准來源' },
    });
    getDb()
      .prepare("UPDATE sources SET review_status = 'approved' WHERE id = ?")
      .run(approved.body.source.id);

    const names = (body: { sources: { name: string }[] }) => body.sources.map((s) => s.name);

    const asGuest = await request('GET', '/api/sources');
    assert.equal(asGuest.status, 200);
    assert.ok(names(asGuest.body).includes('已核准來源'));
    assert.ok(!names(asGuest.body).includes('待審核來源'));

    const asUser = await request('GET', '/api/sources', { cookie: user.cookie });
    assert.ok(!names(asUser.body).includes('待審核來源'));

    const asAdmin = await request('GET', '/api/sources', { cookie: admin.cookie });
    assert.ok(names(asAdmin.body).includes('待審核來源'));
    assert.ok(names(asAdmin.body).includes('已核准來源'));
    assert.ok(pending.body.source.id);
  });
});

async function loginAdmin(email: string) {
  await registerUser(email);
  assert.equal(setUserRole(email, 'admin'), true);
  const login = await request('POST', '/api/auth/login', {
    body: { email, password: 'password123' },
  });
  assert.ok(login.cookie);
  return { cookie: login.cookie };
}

async function submitAs(cookie: string, name: string) {
  const result = await request('POST', '/api/sources', {
    cookie,
    body: { ...validSource, name },
  });
  assert.equal(result.status, 201);
  return result.body.source.id as number;
}

describe('GET /api/sources（管理員審核清單）', () => {
  test('管理員看得到提交者與審核結果，並可用 status 篩選', async () => {
    const user = await registerUser('list-submitter@example.com');
    const admin = await loginAdmin('list-admin@example.com');
    const pendingId = await submitAs(user.cookie, '清單待審核');
    const rejectedId = await submitAs(user.cookie, '清單已退回');
    await request('POST', `/api/sources/${rejectedId}/review`, {
      cookie: admin.cookie,
      body: { decision: 'rejected', note: '不是海大的來源' },
    });

    const pending = await request('GET', '/api/sources?status=pending', { cookie: admin.cookie });
    assert.equal(pending.status, 200);
    const found = pending.body.sources.find((s: { id: number }) => s.id === pendingId);
    assert.equal(found.submitterName, 'list-submitter');
    assert.equal(found.reviewedAt, null);
    assert.ok(!pending.body.sources.some((s: { id: number }) => s.id === rejectedId));

    const rejected = await request('GET', '/api/sources?status=rejected', {
      cookie: admin.cookie,
    });
    assert.equal(rejected.body.sources[0].reviewNote, '不是海大的來源');

    const bad = await request('GET', '/api/sources?status=oops', { cookie: admin.cookie });
    assert.equal(bad.status, 400);
  });

  test('一般使用者看不到審核資訊，也不能用 status 看待審核來源', async () => {
    const user = await registerUser('list-plain@example.com');
    await submitAs(user.cookie, '一般使用者看不到');
    const result = await request('GET', '/api/sources?status=pending', { cookie: user.cookie });
    assert.equal(result.status, 200);
    for (const source of result.body.sources) {
      assert.equal(source.reviewStatus, 'approved');
      assert.equal(source.submitterName, undefined);
    }
  });
});

describe('POST /api/sources/:sourceId/review', () => {
  test('訪客 401，一般使用者 403', async () => {
    const user = await registerUser('review-user@example.com');
    const id = await submitAs(user.cookie, '權限測試');
    const body = { decision: 'rejected' };
    assert.equal((await request('POST', `/api/sources/${id}/review`, { body })).status, 401);
    assert.equal(
      (await request('POST', `/api/sources/${id}/review`, { cookie: user.cookie, body })).status,
      403,
    );
  });

  test('核准：狀態變為已核准，保存審核者、時間與海大確認，且不改變啟用狀態', async () => {
    const user = await registerUser('approve-submitter@example.com');
    const admin = await loginAdmin('approve-admin@example.com');
    const id = await submitAs(user.cookie, '要核准的來源');

    const result = await request('POST', `/api/sources/${id}/review`, {
      cookie: admin.cookie,
      body: { decision: 'approved', ntouVerified: true, note: '  社團官方網站  ' },
    });
    assert.equal(result.status, 200);
    const { source } = result.body;
    assert.equal(source.reviewStatus, 'approved');
    assert.equal(source.enabled, true);
    assert.equal(source.ntouVerified, true);
    assert.equal(source.reviewNote, '社團官方網站');
    assert.ok(source.reviewedBy);
    assert.ok(source.reviewedAt);

    const mine = await request('GET', '/api/sources/mine', { cookie: user.cookie });
    const own = mine.body.sources.find((s: { id: number }) => s.id === id);
    assert.equal(own.reviewStatus, 'approved');
  });

  test('核准前必須確認為海大單位或社團', async () => {
    const user = await registerUser('ntou-submitter@example.com');
    const admin = await loginAdmin('ntou-admin@example.com');
    const id = await submitAs(user.cookie, '沒確認海大');

    for (const body of [
      { decision: 'approved' },
      { decision: 'approved', ntouVerified: false },
      { decision: 'approved', ntouVerified: 'yes' },
    ]) {
      const result = await request('POST', `/api/sources/${id}/review`, {
        cookie: admin.cookie,
        body,
      });
      assert.equal(result.status, 400);
      assert.ok(result.body.fields.ntouVerified);
    }
    const still = await request('GET', '/api/sources?status=pending', { cookie: admin.cookie });
    assert.ok(still.body.sources.some((s: { id: number }) => s.id === id));
  });

  test('退回：狀態變為已退回，不需要海大確認', async () => {
    const user = await registerUser('reject-submitter@example.com');
    const admin = await loginAdmin('reject-admin@example.com');
    const id = await submitAs(user.cookie, '要退回的來源');

    const result = await request('POST', `/api/sources/${id}/review`, {
      cookie: admin.cookie,
      body: { decision: 'rejected', ntouVerified: false },
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.source.reviewStatus, 'rejected');
    assert.equal(result.body.source.ntouVerified, false);
  });

  test('驗證 decision、備註長度與來源是否存在，已審核的來源不能再審核', async () => {
    const user = await registerUser('edge-submitter@example.com');
    const admin = await loginAdmin('edge-admin@example.com');
    const id = await submitAs(user.cookie, '邊界測試');
    const review = (sourceId: number | string, body: unknown) =>
      request('POST', `/api/sources/${sourceId}/review`, { cookie: admin.cookie, body });

    const noDecision = await review(id, {});
    assert.equal(noDecision.status, 400);
    assert.ok(noDecision.body.fields.decision);
    assert.equal((await review(id, { decision: 'rejected', note: 'x'.repeat(501) })).status, 400);
    assert.equal((await review(999999, { decision: 'rejected' })).status, 404);
    assert.equal((await review('abc', { decision: 'rejected' })).status, 404);

    assert.equal((await review(id, { decision: 'rejected' })).status, 200);
    const again = await review(id, { decision: 'approved', ntouVerified: true });
    assert.equal(again.status, 409);
    assert.equal(again.body.error, 'already_reviewed');
  });
});
