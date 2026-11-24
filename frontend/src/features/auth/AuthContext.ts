import { createContext, useContext } from 'react';
import type { ProfileInput, Role, User } from './api';

export interface AuthContextValue {
  /** 目前登入的使用者，訪客為 null */
  user: User | null;
  /** 第一次向後端確認登入狀態時為 true */
  loading: boolean;
  /** 開發模式的模擬登入 */
  devLogin: (studentId: string, role: Role) => Promise<void>;
  /** 回傳更新後的會員資料 */
  updateProfile: (input: ProfileInput) => Promise<User>;
  /** #99 重寄或取消等待驗證的通知信箱 */
  resendEmailVerification: () => Promise<void>;
  cancelEmailVerification: () => Promise<void>;
  /** 重新向後端取得登入狀態（例如完成信箱驗證後） */
  refreshUser: () => Promise<void>;
  /** cas 為 true 時一併登出海大 CAS（會離開本站） */
  logout: (cas?: boolean) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/** 取得登入狀態，需在 AuthProvider 內使用。 */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
