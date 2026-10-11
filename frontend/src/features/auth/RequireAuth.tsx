import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import type { Role } from './api';
import { useAuth } from './AuthContext';

interface RequireAuthProps {
  /** 指定時只有該角色可進入，例如 role="admin" */
  role?: Role;
  children: ReactNode;
}

/**
 * 需登入的頁面包在這裡面；訪客導向登入頁，角色不符顯示權限不足。
 * 只是前端體驗，真正的權限檢查在後端 API。
 */
export function RequireAuth({ role, children }: RequireAuthProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <p>載入中…</p>;

  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?redirect=${redirect}`} replace />;
  }

  if (role && user.role !== role) {
    return (
      <section role="alert">
        <h1>權限不足</h1>
        <p>你沒有存取此頁面的權限。</p>
      </section>
    );
  }

  return children;
}
