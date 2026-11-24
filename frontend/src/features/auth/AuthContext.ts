import { createContext, useContext } from 'react';
import type { ProfileInput, Role, User } from './api';

export interface AuthContextValue {
  /** 目前登入的使用者，訪客為 null */
  user: User | null;
  /** 第一次向後端確認登入狀態時為 true */
  loading: boolean;
  /** 開發模式的模擬登入 */
  devLogin: (studentId: string, role: Role) => Promise<void>;
  updateProfile: (input: ProfileInput) => Promise<void>;
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
