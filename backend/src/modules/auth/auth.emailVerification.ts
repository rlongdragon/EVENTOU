import { createHash, randomBytes } from 'node:crypto';
import { getDb } from '../../db/index.js';
import type { EmailMessage } from '../subscriptions/subscriptions.email.js';
import type { Mailer } from '../subscriptions/subscriptions.mailer.js';
import { defaultSchoolEmail } from './auth.service.js';

// #99 修改通知信箱須寄驗證信確認。
// users.email 永遠是「已驗證」的通知信箱，新活動通知只寄到這裡；
// 新信箱先存在 email_verifications，使用者點了驗證信中的連結才寫回 users.email。

/** 驗證連結有效時間 */
export const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
/** 每位使用者每小時最多寄出的驗證信數（含重寄） */
export const VERIFICATION_SENDS_PER_HOUR = 3;
const HOUR_MS = 60 * 60 * 1000;

export interface EmailVerificationDeps {
  mailer: Mailer;
  /** 網站對外位址（不含結尾斜線），用來組出驗證連結 */
  baseUrl: string;
  now?: Date;
}

export type EmailChangeResult =
  /** 信箱已直接更新（清空、改回原本的信箱，或學校信箱） */
  | { status: 'updated' }
  /** 已寄出驗證信，驗證前通知仍寄到原本的信箱 */
  | { status: 'sent'; pendingEmail: string }
  | { status: 'rate_limited' }
  | { status: 'send_failed' };

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildVerificationEmail(
  recipient: { email: string; displayName: string },
  verifyUrl: string,
): EmailMessage {
  const ignore = '如果你沒有在 EVENTOU 修改通知信箱，請忽略這封信，信箱不會被變更。';
  const text = [
    `${recipient.displayName} 你好，`,
    '',
    '你在 EVENTOU 把新活動通知信箱改成這個地址。請在 24 小時內開啟以下連結完成驗證，',
    '驗證完成前，通知仍會寄到原本的信箱：',
    '',
    verifyUrl,
    '',
    ignore,
  ].join('\n');
  const html = [
    `<p>${escapeHtml(recipient.displayName)} 你好，</p>`,
    '<p>你在 EVENTOU 把新活動通知信箱改成這個地址。請在 24 小時內點下方按鈕完成驗證，驗證完成前，通知仍會寄到原本的信箱。</p>',
    `<p><a href="${escapeHtml(verifyUrl)}">驗證通知信箱</a></p>`,
    `<p style="color:#57606a;font-size:0.875em">${escapeHtml(ignore)}</p>`,
  ].join('\n');
  return { to: recipient.email, subject: '【EVENTOU】請驗證你的通知信箱', text, html };
}

/** 目前等待驗證的新信箱；沒有或已過期時回傳 null */
export function getPendingEmail(userId: number, now = new Date()): string | null {
  const row = getDb()
    .prepare(
      `SELECT email FROM email_verifications
      WHERE user_id = ? AND status = 'pending' AND expires_at > ?
      ORDER BY id DESC LIMIT 1`,
    )
    .get(userId, now.toISOString());
  return row ? String(row.email) : null;
}

/** 取消所有等待驗證的信箱（改回原本的信箱、清空信箱或使用者主動取消時） */
export function cancelPendingEmail(userId: number): void {
  getDb()
    .prepare(
      `UPDATE email_verifications SET status = 'cancelled' WHERE user_id = ? AND status = 'pending'`,
    )
    .run(userId);
}

function setVerifiedEmail(userId: number, email: string | null): void {
  getDb().prepare('UPDATE users SET email = ? WHERE id = ?').run(email, userId);
  cancelPendingEmail(userId);
}

/** 產生新的驗證連結並寄出；超過頻率限制或寄送失敗時不留下紀錄以外的變更 */
async function sendVerification(
  user: { id: number; displayName: string },
  email: string,
  { mailer, baseUrl, now = new Date() }: EmailVerificationDeps,
): Promise<EmailChangeResult> {
  const db = getDb();
  const recentSends = db
    .prepare(
      'SELECT COUNT(*) AS count FROM email_verifications WHERE user_id = ? AND created_at > ?',
    )
    .get(user.id, new Date(now.getTime() - HOUR_MS).toISOString());
  if (Number(recentSends?.count) >= VERIFICATION_SENDS_PER_HOUR) return { status: 'rate_limited' };

  const token = randomBytes(32).toString('base64url');
  cancelPendingEmail(user.id);
  const inserted = db
    .prepare(
      `INSERT INTO email_verifications (user_id, email, token_hash, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(
      user.id,
      email,
      hashToken(token),
      now.toISOString(),
      new Date(now.getTime() + VERIFICATION_TTL_MS).toISOString(),
    );
  // 驗證頁由前端以 POST 送出 token，避免信箱的連結掃描程式開啟網址就完成驗證
  const verifyUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
  try {
    await mailer.send(buildVerificationEmail({ email, displayName: user.displayName }, verifyUrl));
  } catch (error) {
    console.error('[auth] 驗證信寄送失敗', error);
    // 沒寄出的不算進頻率限制，也不留下等待驗證的信箱
    db.prepare('DELETE FROM email_verifications WHERE id = ?').run(Number(inserted?.id));
    return { status: 'send_failed' };
  }
  return { status: 'sent', pendingEmail: email };
}

/**
 * 修改通知信箱。email 須先驗證格式並轉成小寫，null 表示不寄通知。
 * 清空、改回目前的信箱，或改成本人的學校信箱（帳號已經過 CAS 驗證）時直接生效；
 * 其他信箱先寄驗證信，驗證完成才生效。
 */
export async function requestEmailChange(
  user: { id: number; studentId: string | null; email: string | null; displayName: string },
  email: string | null,
  deps: EmailVerificationDeps,
): Promise<EmailChangeResult> {
  const schoolEmail = user.studentId ? defaultSchoolEmail(user.studentId) : null;
  if (email === null || email === user.email || email === schoolEmail) {
    setVerifiedEmail(user.id, email);
    return { status: 'updated' };
  }
  return sendVerification(user, email, deps);
}

/** 重寄目前等待驗證信箱的驗證信；沒有等待驗證的信箱時回傳 null */
export async function resendVerification(
  user: { id: number; displayName: string },
  deps: EmailVerificationDeps,
): Promise<EmailChangeResult | null> {
  const pending = getPendingEmail(user.id, deps.now);
  return pending ? sendVerification(user, pending, deps) : null;
}

/** 以驗證信中的 token 完成驗證；token 只能使用一次，過期或已取消時回傳 false */
export function verifyEmailToken(token: string, now = new Date()): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, user_id, email FROM email_verifications
      WHERE token_hash = ? AND status = 'pending' AND expires_at > ?`,
    )
    .get(hashToken(token), now.toISOString());
  if (!row) return false;
  db.exec('BEGIN');
  try {
    db.prepare(
      `UPDATE email_verifications SET status = 'verified', verified_at = ? WHERE id = ?`,
    ).run(now.toISOString(), Number(row.id));
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(
      String(row.email),
      Number(row.user_id),
    );
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return true;
}
