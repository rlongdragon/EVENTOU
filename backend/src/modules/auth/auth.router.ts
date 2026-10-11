import { Router } from 'express';
import { notImplemented } from '../../shared/notImplemented.js';

// 帳號：US-06 註冊／登入（#20）
export const authRouter = Router();

// TODO(#20): 註冊帳號
authRouter.post('/register', notImplemented('#20'));
// TODO(#20): 登入，回傳 session / token
authRouter.post('/login', notImplemented('#20'));
// TODO(#20): 登出
authRouter.post('/logout', notImplemented('#20'));
// TODO(#20): 取得目前登入的使用者
authRouter.get('/me', notImplemented('#20'));

// TODO(#20): 提供 requireAuth middleware，供 US-07、US-09、US-10、US-11 等需登入的功能使用
