import { NavLink, Outlet } from 'react-router';
import type { Role } from '../features/auth/api';
import { useAuth } from '../features/auth/AuthContext';

// role：只顯示給該角色；需登入但不限角色的頁面照常顯示，點進去會導向登入
const NAV_ITEMS: { to: string; label: string; role?: Role }[] = [
  { to: '/', label: '活動' },
  { to: '/map', label: '地圖' },
  { to: '/calendars', label: '行事曆' },
  { to: '/subscriptions', label: '訂閱' },
  { to: '/sources/new', label: '提交來源' },
  { to: '/admin/sources', label: '來源管理', role: 'admin' },
  { to: '/admin/duplicates', label: '重複活動', role: 'admin' },
];

const ROLE_LABELS: Record<Role, string> = { user: '一般使用者', admin: '管理員' };

export function Layout() {
  const { user, loading, logout } = useAuth();
  const navItems = NAV_ITEMS.filter((item) => !item.role || item.role === user?.role);

  return (
    <>
      <header className="site-header">
        <nav className="site-nav">
          <strong className="site-logo">
            <svg width="24" height="24" viewBox="0 0 28 28" aria-hidden="true">
              <circle cx="14" cy="14" r="12" fill="none" stroke="currentColor" strokeWidth="2" />
              <path
                d="M6 16c3-3 5-3 8 0s5 3 8 0"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            EVENTOU
          </strong>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              {item.label}
            </NavLink>
          ))}
          <span className="site-nav-user">
            {!loading && user && (
              <>
                <span>
                  {user.displayName}（{ROLE_LABELS[user.role]}）
                </span>
                <button type="button" onClick={() => void logout()}>
                  登出
                </button>
              </>
            )}
            {!loading && !user && <NavLink to="/login">登入／註冊</NavLink>}
          </span>
        </nav>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
    </>
  );
}
