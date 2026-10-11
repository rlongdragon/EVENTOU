import type { Request, Response } from 'express';

// session token 放在 httpOnly cookie，前端 JS 讀不到，只能透過 /api/auth/me 取得登入狀態

const SESSION_COOKIE = 'eventou_session';

const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;

export function readSessionToken(req: Request): string | undefined {
  for (const part of req.headers.cookie?.split(';') ?? []) {
    const [name, ...value] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions, expires: expiresAt });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions);
}
