import type { RequestHandler } from 'express';
import { findUserBySessionToken } from './auth.service.js';
import type { Role } from './roles.js';
import { readSessionToken } from './session.js';

/** 全域 middleware：有有效 session 時把使用者放進 req.user，沒有則維持訪客。 */
export const authenticate: RequestHandler = (req, _res, next) => {
  const token = readSessionToken(req);
  req.user = token ? findUserBySessionToken(token) : undefined;
  next();
};

/** 需登入的 API 使用，訪客回傳 401。 */
export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: 'unauthorized', message: '請先登入' });
    return;
  }
  next();
};

/** 限定角色的 API 使用，例如 requireRole('admin')；訪客回傳 401，角色不符回傳 403。 */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: 'unauthorized', message: '請先登入' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'forbidden', message: '權限不足' });
      return;
    }
    next();
  };
}
