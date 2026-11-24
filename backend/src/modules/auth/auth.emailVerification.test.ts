import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../../app.js';
import { closeDb, getDb, migrate } from '../../db/index.js';
import type { EmailMessage } from '../subscriptions/subscriptions.email.js';
import type { Mailer } from '../subscriptions/subscriptions.mailer.js';
import {
  requestEmailChange,
  resendVerification,
  VERIFICATION_TTL_MS,
  verifyEmailToken,
} from './auth.emailVerification.js';
import { createTestUser } from './auth.testHelpers.js';

process.env.DATABASE_PATH = ':memory:';
process.env.SCHOOL_EMAIL_DOMAIN = 'mail.ntou.edu.tw';
delete process.env.SMTP_HOST;

const BASE_URL = 'https://eventou.example.ntou.edu.tw';

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

/** 記下寄出的信，failing 為 true 時模擬 SMTP 失敗 */
function fakeMailer(): Mailer & { sent: EmailMessage[]; failing: boolean } {
  const mailer = {
    sent: [] as EmailMessage[],
    failing: false,
    async send(message: EmailMessage) {
      if (mailer.failing) throw new Error('SMTP down');
      mailer.sent.push(message);
    },
  };
  return mailer;
}

function tokenFrom(message: EmailMessage): string {
  const url = message.text.match(/https?:\/\/\S+verify-email\?token=\S+/)?.[0];
  assert.ok(url, '驗證信要有驗證連結');
  return new URL(url).searchParams.get('token') ?? '';
}

function storedEmail(userId: number): string | null {
  const row = getDb().prepare('SELECT email FROM users WHERE id = ?').get(userId);
  return row?.email === null ? null : String(row?.email);
}

function userFor(input: { studentId?: string; email?: string | null } = {}) {
  const created = createTestUser(input);
  return {
    ...created,
    email: storedEmail(created.id),
    displayName: created.studentId,
  };
}

describe('修改通知信箱需驗證（#99）', () => {
  test('新信箱寄出驗證信，驗證前通知信箱不變，驗證後才更新', async () => {
    const mailer = fakeMailer();
    const user = userFor();
    const now = new Date('2026-11-24T10:00:00Z');
    const result = await requestEmailChange(user, 'new@example.com', {
      mailer,
      baseUrl: BASE_URL,
      now,
    });
    assert.deepEqual(result, { status: 'sent', pendingEmail: 'new@example.com' });
    assert.equal(mailer.sent.length, 1);
    assert.equal(mailer.sent[0].to, 'new@example.com');
    assert.ok(mailer.sent[0].text.startsWith(`${user.displayName} 你好`));
    assert.equal(storedEmail(user.id), user.email);

    assert.equal(verifyEmailToken(tokenFrom(mailer.sent[0]), now), true);
    assert.equal(storedEmail(user.id), 'new@example.com');
  });

  test('token 只能用一次，過期或錯誤的 token 都無效', async () => {
    const mailer = fakeMailer();
    const user = userFor();
    const now = new Date('2026-11-24T10:00:00Z');
    await requestEmailChange(user, 'a@example.com', { mailer, baseUrl: BASE_URL, now });
    const token = tokenFrom(mailer.sent[0]);
    const expired = new Date(now.getTime() + VERIFICATION_TTL_MS + 1000);
    assert.equal(verifyEmailToken(token, expired), false);
    assert.equal(verifyEmailToken('wrong-token', now), false);
    assert.equal(verifyEmailToken(token, now), true);
    assert.equal(verifyEmailToken(token, now), false);
  });

  test('改寄新的驗證信後，舊的連結失效', async () => {
    const mailer = fakeMailer();
    const user = userFor();
    const now = new Date('2026-11-24T10:00:00Z');
    await requestEmailChange(user, 'first@example.com', { mailer, baseUrl: BASE_URL, now });
    await requestEmailChange(user, 'second@example.com', { mailer, baseUrl: BASE_URL, now });
    assert.equal(verifyEmailToken(tokenFrom(mailer.sent[0]), now), false);
    assert.equal(verifyEmailToken(tokenFrom(mailer.sent[1]), now), true);
    assert.equal(storedEmail(user.id), 'second@example.com');
  });

  test('清空、改回原信箱或改成本人學校信箱時直接生效，不寄信', async () => {
    const mailer = fakeMailer();
    const user = userFor({ studentId: '01357999', email: null });
    const deps = { mailer, baseUrl: BASE_URL };
    assert.deepEqual(await requestEmailChange(user, '01357999@mail.ntou.edu.tw', deps), {
      status: 'updated',
    });
    assert.equal(storedEmail(user.id), '01357999@mail.ntou.edu.tw');
    // 別人的學校信箱仍須驗證
    assert.equal(
      (await requestEmailChange(user, '01350000@mail.ntou.edu.tw', deps)).status,
      'sent',
    );
    assert.deepEqual(await requestEmailChange(user, null, deps), { status: 'updated' });
    assert.equal(storedEmail(user.id), null);
    assert.equal(mailer.sent.length, 1);
  });

  test('每小時最多寄 3 封（含重寄），一小時後恢復', async () => {
    const mailer = fakeMailer();
    const user = userFor();
    const now = new Date('2026-11-24T10:00:00Z');
    const deps = { mailer, baseUrl: BASE_URL, now };
    assert.equal((await requestEmailChange(user, 'x@example.com', deps)).status, 'sent');
    assert.equal((await resendVerification(user, deps))?.status, 'sent');
    assert.equal((await resendVerification(user, deps))?.status, 'sent');
    assert.equal((await resendVerification(user, deps))?.status, 'rate_limited');
    assert.equal((await requestEmailChange(user, 'y@example.com', deps)).status, 'rate_limited');
    assert.equal(mailer.sent.length, 3);
    const later = new Date(now.getTime() + 61 * 60 * 1000);
    assert.equal((await resendVerification(user, { ...deps, now: later }))?.status, 'sent');
  });

  test('寄送失敗時不留下等待驗證的信箱，也不計入頻率限制', async () => {
    const mailer = fakeMailer();
    mailer.failing = true;
    const user = userFor();
    const deps = { mailer, baseUrl: BASE_URL };
    for (let i = 0; i < 4; i += 1) {
      assert.equal((await requestEmailChange(user, 'z@example.com', deps)).status, 'send_failed');
    }
    assert.equal(await resendVerification(user, deps), null);
    mailer.failing = false;
    assert.equal((await requestEmailChange(user, 'z@example.com', deps)).status, 'sent');
  });

  test('驗證 API：不需登入，token 無效時回 400', async () => {
    const mailer = fakeMailer();
    const user = userFor();
    await requestEmailChange(user, 'api@example.com', { mailer, baseUrl: BASE_URL });
    const post = (token: unknown) =>
      fetch(`${baseUrl}/api/auth/verify-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
    assert.equal((await post('nope')).status, 400);
    assert.equal((await post(123)).status, 400);
    assert.equal((await post(tokenFrom(mailer.sent[0]))).status, 200);
    assert.equal(storedEmail(user.id), 'api@example.com');
  });

  test('重寄與取消 API', async () => {
    const { cookie } = createTestUser();
    const call = (method: string) =>
      fetch(`${baseUrl}/api/auth/me/email-verification`, {
        method,
        headers: { Cookie: cookie },
      });
    assert.equal((await call('POST')).status, 404);
    const patched = await fetch(`${baseUrl}/api/auth/me`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ email: 'pending@example.com' }),
    });
    const patchedBody = (await patched.json()) as { user: { pendingEmail: string | null } };
    assert.equal(patchedBody.user.pendingEmail, 'pending@example.com');
    assert.equal((await call('POST')).status, 200);
    const cancelled = await call('DELETE');
    const cancelledBody = (await cancelled.json()) as { user: { pendingEmail: string | null } };
    assert.equal(cancelledBody.user.pendingEmail, null);
    assert.equal((await call('POST')).status, 404);
    const guest = await fetch(`${baseUrl}/api/auth/me/email-verification`, { method: 'POST' });
    assert.equal(guest.status, 401);
  });
});
