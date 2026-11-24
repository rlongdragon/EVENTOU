import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, test } from 'node:test';
import { createApp } from '../../app.js';
import { closeDb, migrate } from '../../db/index.js';
import { createTestUser } from './auth.testHelpers.js';
import { safeRedirectPath } from './auth.router.js';
import { maskStudentId } from './auth.service.js';
import { parseServiceResponse } from './cas.js';

process.env.DATABASE_PATH = ':memory:';
process.env.PUBLIC_BASE_URL = 'https://eventou.example.ntou.edu.tw';
delete process.env.SCHOOL_EMAIL_DOMAIN;
delete process.env.AUTH_DEV_LOGIN;

let server: Server;
let baseUrl: string;

// 假的 CAS 伺服器：只有 service 逐字相符且票在 tickets 裡時才驗證成功，每張票只能用一次
let casServer: Server;
const tickets = new Map<string, { service: string; account: string }>();
let casValidateCalls: string[] = [];
let casDown = false;

const success = (account: string) =>
  `<cas:serviceResponse xmlns:cas='http://www.yale.edu/tp/cas'>
  <cas:authenticationSuccess><cas:user>${account}</cas:user></cas:authenticationSuccess>
</cas:serviceResponse>`;
const failure = `<cas:serviceResponse xmlns:cas='http://www.yale.edu/tp/cas'>
  <cas:authenticationFailure code='INVALID_TICKET'>Ticket not recognized</cas:authenticationFailure>
</cas:serviceResponse>`;

before(async () => {
  casServer = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://cas.invalid');
    if (url.pathname !== '/cas/serviceValidate') {
      res.writeHead(404).end();
      return;
    }
    casValidateCalls.push(url.search);
    if (casDown) {
      res.writeHead(500).end();
      return;
    }
    const ticket = tickets.get(url.searchParams.get('ticket') ?? '');
    const ok = ticket && ticket.service === url.searchParams.get('service');
    tickets.delete(url.searchParams.get('ticket') ?? '');
    res.writeHead(200, { 'Content-Type': 'text/xml' }).end(ok ? success(ticket.account) : failure);
  }).listen(0);
  await new Promise((resolve) => casServer.once('listening', resolve));
  process.env.CAS_BASE_URL = `http://localhost:${(casServer.address() as AddressInfo).port}/cas`;

  migrate();
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(() => {
  server.close();
  casServer.close();
  closeDb();
});

beforeEach(() => {
  tickets.clear();
  casValidateCalls = [];
  casDown = false;
});

async function request(
  method: string,
  path: string,
  options: { body?: unknown; cookie?: string } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/json',
      ...(options.cookie ? { Cookie: options.cookie } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const cookies = new Map<string, string>();
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(';');
    const index = pair.indexOf('=');
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { status: response.status, body, cookies, location: response.headers.get('location') };
}

/** 走完整個 CAS 登入：導向 CAS → CAS 發票 → 回呼。回傳回呼的結果。 */
async function casLogin(account: string, redirect = '/') {
  const start = await request(
    'GET',
    `/api/auth/cas/login?redirect=${encodeURIComponent(redirect)}`,
  );
  assert.equal(start.status, 302);
  const service = new URL(start.location ?? '').searchParams.get('service') ?? '';
  const state = new URL(service).searchParams.get('state') ?? '';
  const ticket = `ST-${account}-${Math.random()}`;
  tickets.set(ticket, { service, account });
  const stateCookie = `eventou_cas_state=${start.cookies.get('eventou_cas_state')}`;
  return request(
    'GET',
    `/api/auth/cas/callback?state=${encodeURIComponent(state)}&ticket=${encodeURIComponent(ticket)}`,
    { cookie: stateCookie },
  );
}

function sessionCookie(result: { cookies: Map<string, string> }): string {
  const token = result.cookies.get('eventou_session');
  assert.ok(token);
  return `eventou_session=${token}`;
}

describe('CAS 登入', () => {
  test('導向海大 CAS，service 是本站回呼網址並帶 state', async () => {
    const result = await request('GET', '/api/auth/cas/login?redirect=/events/3');
    assert.equal(result.status, 302);
    const location = new URL(result.location ?? '');
    assert.equal(location.origin + location.pathname, `${process.env.CAS_BASE_URL}/login`);
    const service = new URL(location.searchParams.get('service') ?? '');
    assert.equal(
      service.origin + service.pathname,
      'https://eventou.example.ntou.edu.tw/api/auth/cas/callback',
    );
    assert.ok(service.searchParams.get('state'));
    assert.ok(result.cookies.get('eventou_cas_state'));
  });

  test('第一次登入自動建立會員：遮蔽學號當顯示名稱、學校信箱當通知信箱，並回到原頁面', async () => {
    const result = await casLogin('01357107', '/events/3?tab=info');
    assert.equal(result.status, 302);
    assert.equal(result.location, '/events/3?tab=info');

    const me = await request('GET', '/api/auth/me', { cookie: sessionCookie(result) });
    assert.equal(me.status, 200);
    assert.equal(me.body.user.studentId, '01357107');
    assert.equal(me.body.user.displayName, '0135****');
    assert.equal(me.body.user.email, '01357107@mail.ntou.edu.tw');
    assert.equal(me.body.user.role, 'user');
    assert.equal(me.body.user.passwordHash, undefined);
  });

  test('之後登入對應到同一筆會員資料', async () => {
    const first = await casLogin('01357108');
    const firstMe = await request('GET', '/api/auth/me', { cookie: sessionCookie(first) });
    await request('PATCH', '/api/auth/me', {
      cookie: sessionCookie(first),
      body: { displayName: '小明' },
    });

    const second = await casLogin('01357108');
    const secondMe = await request('GET', '/api/auth/me', { cookie: sessionCookie(second) });
    assert.equal(secondMe.body.user.id, firstMe.body.user.id);
    assert.equal(secondMe.body.user.displayName, '小明');
  });

  test('登入後只會回到站內頁面', () => {
    assert.equal(safeRedirectPath('/events/3?x=1#c'), '/events/3?x=1#c');
    assert.equal(safeRedirectPath('//evil.example/path'), '/');
    assert.equal(safeRedirectPath('/\\evil.example'), '/');
    assert.equal(safeRedirectPath('/\tevil.example'), '/\tevil.example'.replace('\t', ''));
    assert.equal(safeRedirectPath('https://evil.example'), '/');
    assert.equal(safeRedirectPath(undefined), '/');
  });

  test('CAS 驗證失敗時不建立 session，回登入頁顯示錯誤', async () => {
    const start = await request('GET', '/api/auth/cas/login');
    const service = new URL(start.location ?? '').searchParams.get('service') ?? '';
    const state = new URL(service).searchParams.get('state') ?? '';
    const result = await request('GET', `/api/auth/cas/callback?state=${state}&ticket=ST-fake`, {
      cookie: `eventou_cas_state=${start.cookies.get('eventou_cas_state')}`,
    });
    assert.equal(result.status, 302);
    assert.equal(result.location, '/login?error=cas');
    assert.equal(result.cookies.get('eventou_session'), undefined);
    assert.equal(casValidateCalls.length, 1);
  });

  test('不是從這個瀏覽器發起的登入（沒有或不符的 state）直接拒絕，不向 CAS 驗證', async () => {
    const start = await request('GET', '/api/auth/cas/login');
    const stateCookie = `eventou_cas_state=${start.cookies.get('eventou_cas_state')}`;

    const noCookie = await request('GET', '/api/auth/cas/callback?state=x&ticket=ST-1');
    const wrongState = await request('GET', '/api/auth/cas/callback?state=x&ticket=ST-1', {
      cookie: stateCookie,
    });
    for (const result of [noCookie, wrongState]) {
      assert.equal(result.location, '/login?error=cas');
      assert.equal(result.cookies.get('eventou_session'), undefined);
    }
    assert.equal(casValidateCalls.length, 0);
  });

  test('別的瀏覽器取得的票（service 的 state 不同）驗證不會通過', async () => {
    // 攻擊者自己登入取得一張票，再誘使受害者用自己的 state 打回呼
    const attacker = await request('GET', '/api/auth/cas/login');
    const attackerService = new URL(attacker.location ?? '').searchParams.get('service') ?? '';
    tickets.set('ST-attacker', { service: attackerService, account: '09999999' });

    const victim = await request('GET', '/api/auth/cas/login');
    const victimService = new URL(victim.location ?? '').searchParams.get('service') ?? '';
    const victimState = new URL(victimService).searchParams.get('state') ?? '';
    const result = await request(
      'GET',
      `/api/auth/cas/callback?state=${victimState}&ticket=ST-attacker`,
      { cookie: `eventou_cas_state=${victim.cookies.get('eventou_cas_state')}` },
    );
    assert.equal(result.location, '/login?error=cas');
    assert.equal(result.cookies.get('eventou_session'), undefined);
  });

  test('CAS 連不上時回登入頁顯示錯誤', async () => {
    casDown = true;
    const start = await request('GET', '/api/auth/cas/login');
    const service = new URL(start.location ?? '').searchParams.get('service') ?? '';
    const state = new URL(service).searchParams.get('state') ?? '';
    const result = await request('GET', `/api/auth/cas/callback?state=${state}&ticket=ST-1`, {
      cookie: `eventou_cas_state=${start.cookies.get('eventou_cas_state')}`,
    });
    assert.equal(result.location, '/login?error=cas');
    assert.equal(result.cookies.get('eventou_session'), undefined);
  });

  test('只採用驗證成功區塊裡的英數字帳號', () => {
    assert.deepEqual(parseServiceResponse(success('01357107')), {
      ok: true,
      account: '01357107',
    });
    assert.equal(parseServiceResponse(failure).ok, false);
    assert.equal(parseServiceResponse(success('a<b>')).ok, false);
    assert.equal(parseServiceResponse('<cas:user>01357107</cas:user>').ok, false);
  });

  test('遮蔽學號', () => {
    assert.equal(maskStudentId('01357107'), '0135****');
    assert.equal(maskStudentId('A12345'), 'A1****');
    assert.equal(maskStudentId('123'), '****');
  });

  test('舊的註冊與密碼登入 API 已移除', async () => {
    assert.equal((await request('POST', '/api/auth/register', { body: {} })).status, 404);
    assert.equal((await request('POST', '/api/auth/login', { body: {} })).status, 404);
  });
});

describe('會員資料', () => {
  test('可修改顯示名稱與通知信箱，清空信箱表示不寄通知', async () => {
    const { cookie } = createTestUser();
    const updated = await request('PATCH', '/api/auth/me', {
      cookie,
      body: { displayName: '  阿華  ', email: 'Hua@Example.com' },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.user.displayName, '阿華');
    assert.equal(updated.body.user.email, 'hua@example.com');

    const cleared = await request('PATCH', '/api/auth/me', { cookie, body: { email: '' } });
    assert.equal(cleared.body.user.email, null);
    assert.equal(cleared.body.user.displayName, '阿華');
  });

  test('驗證顯示名稱與信箱格式', async () => {
    const { cookie } = createTestUser();
    const result = await request('PATCH', '/api/auth/me', {
      cookie,
      body: { displayName: ' ', email: 'not-an-email' },
    });
    assert.equal(result.status, 400);
    assert.deepEqual(Object.keys(result.body.fields).sort(), ['displayName', 'email']);
    const tooLong = await request('PATCH', '/api/auth/me', {
      cookie,
      body: { displayName: 'x'.repeat(51) },
    });
    assert.equal(tooLong.status, 400);
  });

  test('訪客不能修改', async () => {
    assert.equal((await request('PATCH', '/api/auth/me', { body: {} })).status, 401);
  });
});

describe('登出', () => {
  test('清掉站內 session；預設不登出 CAS', async () => {
    const { cookie } = createTestUser();
    const result = await request('POST', '/api/auth/logout', { cookie, body: {} });
    assert.equal(result.status, 200);
    assert.equal(result.body.casLogoutUrl, null);
    assert.equal((await request('GET', '/api/auth/me', { cookie })).status, 401);
  });

  test('選擇一併登出 CAS 時回傳 CAS 登出網址，登出後回到本站', async () => {
    const { cookie } = createTestUser();
    const result = await request('POST', '/api/auth/logout', { cookie, body: { cas: true } });
    const url = new URL(result.body.casLogoutUrl);
    assert.equal(url.origin + url.pathname, `${process.env.CAS_BASE_URL}/logout`);
    assert.equal(url.searchParams.get('service'), 'https://eventou.example.ntou.edu.tw/');
    assert.equal((await request('GET', '/api/auth/me', { cookie })).status, 401);
  });
});

describe('開發用登入', () => {
  test('預設關閉', async () => {
    const result = await request('POST', '/api/auth/dev-login', {
      body: { studentId: '00000001' },
    });
    assert.equal(result.status, 404);
  });

  test('AUTH_DEV_LOGIN=1 時可用學號登入，正式環境一律停用', async () => {
    process.env.AUTH_DEV_LOGIN = '1';
    try {
      const bad = await request('POST', '/api/auth/dev-login', { body: { studentId: 'a b' } });
      assert.equal(bad.status, 400);
      const ok = await request('POST', '/api/auth/dev-login', { body: { studentId: '00000001' } });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.user.studentId, '00000001');
      assert.equal(ok.body.user.role, 'user');

      const admin = await request('POST', '/api/auth/dev-login', {
        body: { studentId: '00000002', role: 'admin' },
      });
      assert.equal(admin.body.user.role, 'admin');
      const me = await request('GET', '/api/auth/me', { cookie: sessionCookie(admin) });
      assert.equal(me.body.user.role, 'admin');
      const badRole = await request('POST', '/api/auth/dev-login', {
        body: { studentId: '00000003', role: 'root' },
      });
      assert.equal(badRole.status, 400);

      process.env.NODE_ENV = 'production';
      const prod = await request('POST', '/api/auth/dev-login', {
        body: { studentId: '00000001' },
      });
      assert.equal(prod.status, 404);
    } finally {
      delete process.env.AUTH_DEV_LOGIN;
      delete process.env.NODE_ENV;
    }
  });
});

describe('角色與權限', () => {
  let userCookie: string;
  let adminCookie: string;

  before(() => {
    userCookie = createTestUser().cookie;
    adminCookie = createTestUser({ role: 'admin' }).cookie;
  });

  test('訪客可使用公開功能，不能使用需登入的功能', async () => {
    assert.equal((await request('GET', '/api/events')).status, 200);
    assert.equal((await request('POST', '/api/sources')).status, 401);
    assert.equal((await request('GET', '/api/subscriptions')).status, 401);
    assert.equal((await request('POST', '/api/events/1/comments')).status, 401);
    assert.equal((await request('POST', '/api/sources/1/review')).status, 401);
  });

  test('一般使用者可使用需登入的功能，不能使用管理員功能', async () => {
    const cookie = userCookie;
    assert.equal((await request('POST', '/api/sources', { cookie })).status, 400);
    assert.equal((await request('GET', '/api/subscriptions', { cookie })).status, 200);
    assert.equal((await request('POST', '/api/sources/1/review', { cookie })).status, 403);
    assert.equal((await request('PATCH', '/api/sources/1/enabled', { cookie })).status, 403);
  });

  test('管理員可使用管理功能', async () => {
    const cookie = adminCookie;
    const me = await request('GET', '/api/auth/me', { cookie });
    assert.equal(me.body.user.role, 'admin');
    assert.equal((await request('POST', '/api/sources/1/review', { cookie })).status, 400);
    assert.equal((await request('PATCH', '/api/sources/1/enabled', { cookie })).status, 400);
  });

  test('偽造的 session cookie 視為訪客', async () => {
    const result = await request('GET', '/api/auth/me', { cookie: 'eventou_session=forged' });
    assert.equal(result.status, 401);
  });
});
