import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../../app.js';
import { closeDb, getDb, migrate } from '../../db/index.js';
import { setUserRole } from './auth.service.js';

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
  return result.cookie;
}

describe('POST /api/auth/register', () => {
  test('驗證必要欄位', async () => {
    const result = await request('POST', '/api/auth/register', { body: {} });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'validation_error');
    assert.deepEqual(Object.keys(result.body.fields).sort(), ['displayName', 'email', 'password']);
  });

  test('驗證 Email 格式與密碼長度', async () => {
    const result = await request('POST', '/api/auth/register', {
      body: { email: 'not-an-email', password: 'short', displayName: 'A' },
    });
    assert.equal(result.status, 400);
    assert.ok(result.body.fields.email);
    assert.ok(result.body.fields.password);
  });

  test('註冊成功後為一般使用者並已登入，密碼不以明文儲存', async () => {
    const result = await request('POST', '/api/auth/register', {
      body: { email: 'Alice@Example.com', password: 'password123', displayName: 'Alice' },
    });
    assert.equal(result.status, 201);
    assert.equal(result.body.user.email, 'alice@example.com');
    assert.equal(result.body.user.role, 'user');
    assert.equal(result.body.user.passwordHash, undefined);

    const me = await request('GET', '/api/auth/me', { cookie: result.cookie });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.displayName, 'Alice');

    const row = getDb()
      .prepare('SELECT password_hash FROM users WHERE email = ?')
      .get('alice@example.com') as { password_hash: string };
    assert.notEqual(row.password_hash, 'password123');
    assert.match(row.password_hash, /^scrypt\$/);
  });

  test('重複的 Email 不可註冊', async () => {
    const result = await request('POST', '/api/auth/register', {
      body: { email: 'alice@example.com', password: 'password123', displayName: 'Alice 2' },
    });
    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'email_taken');
  });
});

describe('登入／登出', () => {
  test('密碼錯誤或帳號不存在時回傳 401', async () => {
    const wrongPassword = await request('POST', '/api/auth/login', {
      body: { email: 'alice@example.com', password: 'wrong-password' },
    });
    assert.equal(wrongPassword.status, 401);
    assert.equal(wrongPassword.body.error, 'invalid_credentials');
    assert.equal(wrongPassword.cookie, undefined);

    const unknown = await request('POST', '/api/auth/login', {
      body: { email: 'nobody@example.com', password: 'password123' },
    });
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.message, wrongPassword.body.message);
  });

  test('缺少欄位時回傳 400', async () => {
    const result = await request('POST', '/api/auth/login', { body: { email: '' } });
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'validation_error');
  });

  test('登入後可取得使用者資訊，登出後 session 失效', async () => {
    const login = await request('POST', '/api/auth/login', {
      body: { email: 'ALICE@example.com', password: 'password123' },
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.role, 'user');

    const me = await request('GET', '/api/auth/me', { cookie: login.cookie });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.email, 'alice@example.com');

    const logout = await request('POST', '/api/auth/logout', { cookie: login.cookie });
    assert.equal(logout.status, 204);

    const afterLogout = await request('GET', '/api/auth/me', { cookie: login.cookie });
    assert.equal(afterLogout.status, 401);
  });

  test('未登入時 /me 回傳 401', async () => {
    const result = await request('GET', '/api/auth/me');
    assert.equal(result.status, 401);
  });
});

// 守衛通過後會碰到尚未實作的 handler（501），以此確認權限判斷結果
describe('角色權限', () => {
  let userCookie: string;
  let adminCookie: string;

  before(async () => {
    userCookie = await registerUser('user@example.com');
    adminCookie = await registerUser('admin@example.com');
    assert.equal(setUserRole('admin@example.com', 'admin'), true);
  });

  test('訪客可使用公開功能，不能使用需登入的功能', async () => {
    assert.equal((await request('GET', '/api/events')).status, 501);
    assert.equal((await request('POST', '/api/sources')).status, 401);
    assert.equal((await request('GET', '/api/subscriptions')).status, 401);
    assert.equal((await request('POST', '/api/events/1/comments')).status, 401);
    assert.equal((await request('POST', '/api/sources/1/review')).status, 401);
  });

  test('一般使用者可使用需登入的功能，不能使用管理員功能', async () => {
    const cookie = userCookie;
    assert.equal((await request('POST', '/api/sources', { cookie })).status, 400);
    assert.equal((await request('GET', '/api/subscriptions', { cookie })).status, 501);
    assert.equal((await request('POST', '/api/sources/1/review', { cookie })).status, 403);
    assert.equal((await request('PATCH', '/api/sources/1/enabled', { cookie })).status, 403);
  });

  test('管理員可使用管理功能', async () => {
    const cookie = adminCookie;
    const me = await request('GET', '/api/auth/me', { cookie });
    assert.equal(me.body.user.role, 'admin');
    assert.equal((await request('POST', '/api/sources/1/review', { cookie })).status, 400);
    assert.equal((await request('PATCH', '/api/sources/1/enabled', { cookie })).status, 501);
  });

  test('偽造的 session cookie 視為訪客', async () => {
    const result = await request('GET', '/api/auth/me', { cookie: 'eventou_session=forged' });
    assert.equal(result.status, 401);
  });
});
