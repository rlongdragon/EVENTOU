import { randomBytes } from 'node:crypto';
import { Router, type Response } from 'express';
import { requireAuth } from './auth.middleware.js';
import {
  createSession,
  deleteSession,
  findOrCreateUserByStudentId,
  setUserRole,
  updateUserProfile,
  type User,
} from './auth.service.js';
import { currentAcademicYear, gradeFromAdmissionYear } from '../events/events.relevance.js';
import { INTEREST_DESCRIPTION_MAX_LENGTH, suggestInterestTopics } from '../events/events.llm.js';
import { isDepartment, isEventTopic } from '../events/events.types.js';
import { isRole } from './roles.js';
import { findReservedWord } from './auth.displayName.js';
import {
  casLoginUrl,
  casLogoutUrl,
  casServiceUrl,
  publicBaseUrl,
  validateServiceTicket,
} from './cas.js';
import {
  cancelPendingEmail,
  getPendingEmail,
  requestEmailChange,
  resendVerification,
  verifyEmailToken,
  type EmailChangeResult,
  type EmailVerificationDeps,
} from './auth.emailVerification.js';
import { createMailer, type Mailer } from '../subscriptions/subscriptions.mailer.js';
import {
  clearCasStateCookie,
  clearSessionCookie,
  readCasStateCookie,
  readSessionToken,
  setCasStateCookie,
  setSessionCookie,
} from './session.js';

// 帳號：#90 以海大 CAS 登入，EVENTOU 不保存密碼，只維護會員資料
// 需登入或限定角色的 API 請使用 auth.middleware.ts 的 requireAuth / requireRole
export const authRouter = Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LENGTH = 254;
const DISPLAY_NAME_MAX_LENGTH = 50;
const STUDENT_ID_PATTERN = /^[A-Za-z0-9]{1,32}$/;

// #99 寄驗證信；第一次需要時才依 SMTP 設定建立（未設定 SMTP 時只印在主控台）
let mailer: Mailer | undefined;
function verificationDeps(): EmailVerificationDeps {
  mailer ??= createMailer();
  return { mailer, baseUrl: publicBaseUrl() };
}

/** 回傳給本人的會員資料：另附等待驗證的新信箱 */
/** 本人看到的會員資料：附上等待驗證的信箱（#99）與由入學學年推算的年級（#88） */
function accountView(user: User): User & { pendingEmail: string | null; grade: number | null } {
  return {
    ...user,
    pendingEmail: getPendingEmail(user.id),
    grade: gradeFromAdmissionYear(user.admissionYear),
  };
}

/** 驗證信沒有寄出時回傳錯誤；寄出或直接更新時回傳 false */
function sendEmailChangeError(res: Response, result: EmailChangeResult): boolean {
  if (result.status === 'rate_limited') {
    res.status(429).json({
      error: 'too_many_requests',
      message: '驗證信寄送太頻繁，請一小時後再試',
    });
    return true;
  }
  if (result.status === 'send_failed') {
    res.status(502).json({ error: 'mail_failed', message: '驗證信寄送失敗，請稍後再試' });
    return true;
  }
  return false;
}
const LOGIN_FAILED_PATH = '/login?error=cas';

/** 只接受站內路徑，避免登入後被導到外部網站 */
export function safeRedirectPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) return '/';
  try {
    const url = new URL(value, 'http://eventou.invalid');
    return url.origin === 'http://eventou.invalid' ? url.pathname + url.search + url.hash : '/';
  } catch {
    return '/';
  }
}

function startSession(res: Response, user: User): void {
  const { token, expiresAt } = createSession(user.id);
  setSessionCookie(res, token, expiresAt);
}

authRouter.get('/cas/login', (req, res) => {
  const state = randomBytes(16).toString('base64url');
  setCasStateCookie(res, { state, redirect: safeRedirectPath(req.query.redirect) });
  res.redirect(casLoginUrl(casServiceUrl(state)));
});

authRouter.get('/cas/callback', async (req, res) => {
  const saved = readCasStateCookie(req);
  const { ticket, state } = req.query;
  clearCasStateCookie(res);
  // 登入須從這個瀏覽器發起（state 相符），防止被塞進別人的登入票
  if (!saved || typeof ticket !== 'string' || !ticket || state !== saved.state) {
    res.redirect(LOGIN_FAILED_PATH);
    return;
  }
  const result = await validateServiceTicket(ticket, casServiceUrl(saved.state));
  if (!result.ok) {
    console.warn(`[auth] CAS 登入失敗：${result.error}`);
    res.redirect(LOGIN_FAILED_PATH);
    return;
  }
  startSession(res, findOrCreateUserByStudentId(result.account));
  res.redirect(saved.redirect);
});

// 本機開發的模擬登入（npm run dev 由 .env.development 開啟）；正式環境（NODE_ENV=production）一律停用
authRouter.post('/dev-login', (req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.AUTH_DEV_LOGIN !== '1') {
    res.status(404).json({ error: 'not_found', message: '找不到此 API' });
    return;
  }
  const studentId = typeof req.body?.studentId === 'string' ? req.body.studentId.trim() : '';
  if (!STUDENT_ID_PATTERN.test(studentId)) {
    res.status(400).json({
      error: 'validation_error',
      message: '學號格式不正確',
      fields: { studentId: '學號只能是英數字' },
    });
    return;
  }
  const role: unknown = req.body?.role;
  if (role !== undefined && !isRole(role)) {
    res.status(400).json({
      error: 'validation_error',
      message: '角色不正確',
      fields: { role: '角色不正確' },
    });
    return;
  }
  let user = findOrCreateUserByStudentId(studentId);
  if (role && role !== user.role) {
    setUserRole(studentId, role);
    user = { ...user, role };
  }
  startSession(res, user);
  res.json({ user: accountView(user) });
});

authRouter.post('/logout', (req, res) => {
  const token = readSessionToken(req);
  if (token) deleteSession(token);
  clearSessionCookie(res);
  res.json({ casLogoutUrl: req.body?.cas === true ? casLogoutUrl() : null });
});

authRouter.get('/me', requireAuth, (req, res) => {
  if (!req.user) return;
  res.json({ user: accountView(req.user) });
});

authRouter.patch('/me', requireAuth, async (req, res) => {
  if (!req.user) return;
  const body: unknown = req.body;
  const input: Parameters<typeof updateUserProfile>[1] & { email?: string | null } = {};
  const fields: Record<string, string> = {};
  const raw = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

  if (raw.displayName !== undefined) {
    const displayName = typeof raw.displayName === 'string' ? raw.displayName.trim() : '';
    if (!displayName) fields.displayName = '請輸入顯示名稱';
    else if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
      fields.displayName = `顯示名稱不可超過 ${DISPLAY_NAME_MAX_LENGTH} 個字元`;
    } else {
      // #100 管理員身分以徽章表示，一般使用者不能用保留字冒充
      const reserved = req.user.role === 'admin' ? undefined : findReservedWord(displayName);
      if (reserved) fields.displayName = `顯示名稱不可包含「${reserved}」等保留字`;
      else input.displayName = displayName;
    }
  }
  if (raw.email !== undefined) {
    const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : null;
    if (email === null && raw.email !== null) fields.email = 'Email 格式不正確';
    else if (!email) input.email = null;
    else if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
      fields.email = 'Email 格式不正確';
    } else input.email = email;
  }
  // #88 系所、入學學年（民國）、個人化開關；null 代表清除
  if (raw.department !== undefined) {
    if (raw.department === null || isDepartment(raw.department)) input.department = raw.department;
    else fields.department = '不支援的系所';
  }
  if (raw.admissionYear !== undefined) {
    const year = raw.admissionYear;
    const latest = currentAcademicYear();
    if (year === null) input.admissionYear = null;
    else if (typeof year === 'number' && Number.isInteger(year) && year >= 90 && year <= latest)
      input.admissionYear = year;
    else fields.admissionYear = `入學學年需介於 90 到 ${latest}`;
  }
  if (raw.personalize !== undefined) {
    if (typeof raw.personalize === 'boolean') input.personalize = raw.personalize;
    else fields.personalize = '格式不正確';
  }
  // #98 自我描述與偏好領域；空字串、空陣列代表清空
  if (raw.interestDescription !== undefined) {
    const description =
      typeof raw.interestDescription === 'string' ? raw.interestDescription.trim() : null;
    if (description === null && raw.interestDescription !== null)
      fields.interestDescription = '格式不正確';
    else if (description && description.length > INTEREST_DESCRIPTION_MAX_LENGTH)
      fields.interestDescription = `描述不可超過 ${INTEREST_DESCRIPTION_MAX_LENGTH} 字`;
    else input.interestDescription = description || null;
  }
  if (raw.interestTopics !== undefined) {
    if (Array.isArray(raw.interestTopics) && raw.interestTopics.every(isEventTopic))
      input.interestTopics = raw.interestTopics;
    else fields.interestTopics = '有不存在的領域';
  }

  if (Object.keys(fields).length > 0) {
    res.status(400).json({ error: 'validation_error', message: '會員資料有誤', fields });
    return;
  }
  // #99 信箱先處理：驗證信沒寄出時整個請求失敗，不會只改了一半；信箱不經 updateUserProfile 修改
  const { email, ...profile } = input;
  if (email !== undefined) {
    const result = await requestEmailChange(req.user, email, verificationDeps());
    if (sendEmailChangeError(res, result)) return;
  }
  const user = updateUserProfile(req.user.id, profile);
  res.json({ user: accountView(user) });
});

// #99 重寄驗證信
authRouter.post('/me/email-verification', requireAuth, async (req, res) => {
  if (!req.user) return;
  const result = await resendVerification(req.user, verificationDeps());
  if (!result) {
    res.status(404).json({ error: 'not_found', message: '沒有等待驗證的信箱' });
    return;
  }
  if (sendEmailChangeError(res, result)) return;
  res.json({ user: accountView(req.user) });
});

// #99 取消修改，繼續使用原本的通知信箱
authRouter.delete('/me/email-verification', requireAuth, (req, res) => {
  if (!req.user) return;
  cancelPendingEmail(req.user.id);
  res.json({ user: accountView(req.user) });
});

// #99 驗證信中的連結開啟前端驗證頁，由驗證頁送出 token；不需登入（可能在別的裝置開信）
authRouter.post('/verify-email', (req, res) => {
  const token: unknown = req.body?.token;
  if (typeof token !== 'string' || !token || !verifyEmailToken(token)) {
    res.status(400).json({
      error: 'invalid_token',
      message: '驗證連結無效或已過期，請到帳號頁重新寄送驗證信',
    });
    return;
  }
  res.json({ verified: true });
});

/** #98 每人每 10 分鐘最多請 AI 建議 5 次。 */
const SUGGEST_WINDOW_MS = 10 * 60 * 1000;
const SUGGEST_LIMIT = 5;
const suggestCalls = new Map<number, number[]>();

function allowSuggest(userId: number, now = Date.now()): boolean {
  const recent = (suggestCalls.get(userId) ?? []).filter((time) => now - time < SUGGEST_WINDOW_MS);
  if (recent.length >= SUGGEST_LIMIT) {
    suggestCalls.set(userId, recent);
    return false;
  }
  suggestCalls.set(userId, [...recent, now]);
  return true;
}

// #98 依自我描述建議偏好領域。只回傳建議，不改使用者設定；使用者確認後再用 PATCH /me 儲存。
// 沒有設定 LLM 或呼叫失敗時回 503，前端改成讓使用者手動勾選。描述不寫進紀錄檔。
authRouter.post('/me/interests/suggest', requireAuth, async (req, res) => {
  if (!req.user) return;
  const raw: unknown = (req.body as { description?: unknown } | undefined)?.description;
  const description = typeof raw === 'string' ? raw.trim() : '';
  if (!description || description.length > INTEREST_DESCRIPTION_MAX_LENGTH) {
    res.status(400).json({
      error: 'validation_error',
      message: '描述有誤',
      fields: { description: `請輸入 1–${INTEREST_DESCRIPTION_MAX_LENGTH} 字的描述` },
    });
    return;
  }
  if (!allowSuggest(req.user.id)) {
    res.status(429).json({ error: 'rate_limited', message: '建議次數太多，請稍後再試' });
    return;
  }
  try {
    const topics = await suggestInterestTopics(description);
    if (topics === null) {
      res.status(503).json({ error: 'llm_unavailable', message: '目前無法使用 AI 建議' });
      return;
    }
    res.json({ topics });
  } catch {
    console.error('[llm] 偏好建議失敗');
    res.status(503).json({ error: 'llm_unavailable', message: '目前無法使用 AI 建議' });
  }
});
