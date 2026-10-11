import { Router, type Response } from 'express';
import { requireAuth } from './auth.middleware.js';
import {
  createSession,
  createUser,
  deleteSession,
  findUserByEmail,
  type User,
} from './auth.service.js';
import { hashPassword, verifyDummyPassword, verifyPassword } from './password.js';
import { clearSessionCookie, readSessionToken, setSessionCookie } from './session.js';

// 帳號：US-06 註冊／登入（#20）
// 需登入或限定角色的 API 請使用 auth.middleware.ts 的 requireAuth / requireRole
export const authRouter = Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const DISPLAY_NAME_MAX_LENGTH = 50;

type FieldErrors = Record<string, string>;

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function sendValidationError(res: Response, message: string, fields: FieldErrors): void {
  res.status(400).json({ error: 'validation_error', message, fields });
}

function startSession(res: Response, user: User): void {
  const { token, expiresAt } = createSession(user.id);
  setSessionCookie(res, token, expiresAt);
}

authRouter.post('/register', async (req, res) => {
  const email = asString(req.body?.email).trim().toLowerCase();
  const password = asString(req.body?.password);
  const displayName = asString(req.body?.displayName).trim();

  const fields: FieldErrors = {};
  if (!email) {
    fields.email = '請輸入 Email';
  } else if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    fields.email = 'Email 格式不正確';
  }
  if (!password) {
    fields.password = '請輸入密碼';
  } else if (password.length < PASSWORD_MIN_LENGTH) {
    fields.password = `密碼至少需要 ${PASSWORD_MIN_LENGTH} 個字元`;
  } else if (password.length > PASSWORD_MAX_LENGTH) {
    fields.password = `密碼不可超過 ${PASSWORD_MAX_LENGTH} 個字元`;
  }
  if (!displayName) {
    fields.displayName = '請輸入顯示名稱';
  } else if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    fields.displayName = `顯示名稱不可超過 ${DISPLAY_NAME_MAX_LENGTH} 個字元`;
  }

  if (Object.keys(fields).length > 0) {
    sendValidationError(res, '註冊資料有誤', fields);
    return;
  }
  if (findUserByEmail(email)) {
    res.status(409).json({
      error: 'email_taken',
      message: '此 Email 已被註冊',
      fields: { email: '此 Email 已被註冊' },
    });
    return;
  }

  const user = createUser({ email, displayName, passwordHash: await hashPassword(password) });
  startSession(res, user);
  res.status(201).json({ user });
});

authRouter.post('/login', async (req, res) => {
  const email = asString(req.body?.email).trim().toLowerCase();
  const password = asString(req.body?.password);

  const fields: FieldErrors = {};
  if (!email) fields.email = '請輸入 Email';
  if (!password) fields.password = '請輸入密碼';
  if (Object.keys(fields).length > 0) {
    sendValidationError(res, '請輸入 Email 與密碼', fields);
    return;
  }

  const found = findUserByEmail(email);
  if (!found) await verifyDummyPassword(password);
  if (!found || !(await verifyPassword(password, found.passwordHash))) {
    res.status(401).json({ error: 'invalid_credentials', message: 'Email 或密碼錯誤' });
    return;
  }

  startSession(res, found.user);
  res.json({ user: found.user });
});

authRouter.post('/logout', (req, res) => {
  const token = readSessionToken(req);
  if (token) deleteSession(token);
  clearSessionCookie(res);
  res.status(204).end();
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});
