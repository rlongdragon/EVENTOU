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
];

const ROLE_LABELS: Record<Role, string> = { user: '一般使用者', admin: '管理員' };

export function Layout() {
  const { user, loading, logout } = useAuth();
  const navItems = NAV_ITEMS.filter((item) => !item.role || item.role === user?.role);

  return (
    <>
      <header style={{ borderBottom: '1px solid #d0d7de', padding: '0.75rem 1rem' }}>
        <nav style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <strong>EVENTOU</strong>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              {item.label}
            </NavLink>
          ))}
          <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.75rem' }}>
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
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '1rem' }}>
        <Outlet />
      </main>
    </>
  );
}
