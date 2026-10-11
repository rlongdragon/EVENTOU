import type { User } from '../modules/auth/auth.service.js';

declare global {
  namespace Express {
    interface Request {
      /** 目前登入的使用者，訪客為 undefined（由 authenticate middleware 設定） */
      user?: User;
    }
  }
}
