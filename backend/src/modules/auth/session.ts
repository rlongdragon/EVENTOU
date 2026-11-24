import type { Request, Response } from 'express';

// session token 放在 httpOnly cookie，前端 JS 讀不到，只能透過 /api/auth/me 取得登入狀態

const SESSION_COOKIE = 'eventou_session';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;

// CAS 登入進行中的狀態（state 與登入後要回到的頁面），只在 /api/auth 底下、10 分鐘內有效
const CAS_STATE_COOKIE = 'eventou_cas_state';
const CAS_STATE_TTL_MS = 10 * 60 * 1000;
const casStateOptions = { ...cookieOptions, path: '/api/auth' } as const;

function readCookie(req: Request, cookieName: string): string | undefined {
  for (const part of req.headers.cookie?.split(';') ?? []) {
    const [name, ...value] = part.trim().split('=');
    if (name !== cookieName) continue;
    try {
      return decodeURIComponent(value.join('='));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function readSessionToken(req: Request): string | undefined {
  return readCookie(req, SESSION_COOKIE);
}

export interface CasLoginState {
  state: string;
  redirect: string;
}

export function setCasStateCookie(res: Response, value: CasLoginState): void {
  res.cookie(CAS_STATE_COOKIE, JSON.stringify(value), {
    ...casStateOptions,
    maxAge: CAS_STATE_TTL_MS,
  });
}

export function readCasStateCookie(req: Request): CasLoginState | undefined {
  const raw = readCookie(req, CAS_STATE_COOKIE);
  if (!raw) return undefined;
  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      'state' in value &&
      'redirect' in value &&
      typeof value.state === 'string' &&
      typeof value.redirect === 'string'
    ) {
      return { state: value.state, redirect: value.redirect };
    }
  } catch {
    // 格式不對就當作沒有登入狀態
  }
  return undefined;
}

export function clearCasStateCookie(res: Response): void {
  res.clearCookie(CAS_STATE_COOKIE, casStateOptions);
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, expires: expiresAt });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
}
