import { createContext, useContext } from 'react';
import type { LoginInput, RegisterInput, User } from './api';

export interface AuthContextValue {
  /** 目前登入的使用者，訪客為 null */
  user: User | null;
  /** 第一次向後端確認登入狀態時為 true */
  loading: boolean;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/** 取得登入狀態，需在 AuthProvider 內使用。 */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider');
  return value;
}
