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

  // 刊頭期數：以當月作為「本期」
  const today = new Date();
  const issueMonth = String(today.getMonth() + 1).padStart(2, '0');

  return (
    <>
      <header className="site-header">
        <div className="masthead">
          <div className="masthead-series label">
            <span>NTOU · Event To U</span>
            <span>Campus Events Issue</span>
          </div>
          <div className="masthead-issue">
            <b>{issueMonth}</b>
            <small>
              {today.getFullYear()} 年 {today.getMonth() + 1} 月號
            </small>
          </div>
        </div>
        <nav className="site-nav">
          <strong className="site-logo">EVENTOU</strong>
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
