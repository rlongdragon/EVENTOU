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
import { isDepartment } from '../events/events.types.js';
import { isRole } from './roles.js';
import { casLoginUrl, casLogoutUrl, casServiceUrl, validateServiceTicket } from './cas.js';
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
  res.json({ user: withGrade(user) });
});

authRouter.post('/logout', (req, res) => {
  const token = readSessionToken(req);
  if (token) deleteSession(token);
  clearSessionCookie(res);
  res.json({ casLogoutUrl: req.body?.cas === true ? casLogoutUrl() : null });
});

authRouter.get('/me', requireAuth, (req, res) => {
  if (!req.user) return;
  res.json({ user: withGrade(req.user) });
});

authRouter.patch('/me', requireAuth, (req, res) => {
  if (!req.user) return;
  const body: unknown = req.body;
  const input: Parameters<typeof updateUserProfile>[1] = {};
  const fields: Record<string, string> = {};
  const raw = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};

  if (raw.displayName !== undefined) {
    const displayName = typeof raw.displayName === 'string' ? raw.displayName.trim() : '';
    if (!displayName) fields.displayName = '請輸入顯示名稱';
    else if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
      fields.displayName = `顯示名稱不可超過 ${DISPLAY_NAME_MAX_LENGTH} 個字元`;
    } else input.displayName = displayName;
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

  if (Object.keys(fields).length > 0) {
    res.status(400).json({ error: 'validation_error', message: '會員資料有誤', fields });
    return;
  }
  res.json({ user: withGrade(updateUserProfile(req.user.id, input)) });
});

/** 回應附上由入學學年推算的年級，前端不必自己算學年度。 */
function withGrade(user: User) {
  return { ...user, grade: gradeFromAdmissionYear(user.admissionYear) };
}
