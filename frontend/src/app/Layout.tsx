import { NavLink, Outlet, useLocation } from 'react-router';
import { casLoginUrl, type Role } from '../features/auth/api';
import { AdminBadge } from '../features/auth/AdminBadge';
import { useAuth } from '../features/auth/AuthContext';
import { useTaipeiToday } from '../shared/taipeiToday';
import logoMark from '../assets/logo/eventou-mark.svg';

// role：只顯示給該角色；需登入但不限角色的頁面照常顯示，點進去會導向登入
const NAV_ITEMS: { to: string; label: string; role?: Role }[] = [
  { to: '/', label: '活動' },
  { to: '/map', label: '地圖' },
  { to: '/calendars', label: '行事曆' },
  { to: '/sources/new', label: '提交來源' },
  { to: '/admin/sources', label: '來源管理', role: 'admin' },
  { to: '/admin/duplicates', label: '重複活動', role: 'admin' },
  { to: '/admin/comment-reports', label: '留言檢舉', role: 'admin' },
];

const ROLE_LABELS: Record<Role, string> = { user: '一般使用者', admin: '管理員' };

export function Layout() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const navItems = NAV_ITEMS.filter((item) => !item.role || item.role === user?.role);

  // 刊頭日期：台北時間的今天，過午夜自動換日
  const today = useTaipeiToday();

  return (
    <>
      <header className="site-header">
        <div className="masthead">
          <div className="masthead-series label">
            <span>NTOU · Event To U</span>
            <span>Campus Events Issue</span>
          </div>
          <div className="masthead-issue">
            <b>{String(today.day).padStart(2, '0')}</b>
            <small>
              {today.year} 年 {today.month} 月 · 星期{today.weekday}
            </small>
          </div>
        </div>
        <nav className="site-nav">
          <strong className="site-logo">
            <img src={logoMark} alt="" width={22} height={22} />
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
                <NavLink to="/account">
                  {user.displayName}
                  {user.role === 'admin' ? <AdminBadge compact /> : `（${ROLE_LABELS[user.role]}）`}
                </NavLink>
                <button type="button" onClick={() => void logout()}>
                  登出
                </button>
                <button
                  type="button"
                  className="site-nav-cas-logout"
                  onClick={() => void logout(true)}
                >
                  同時登出海大 CAS
                </button>
              </>
            )}
            {!loading &&
              !user &&
              // 正式環境直接前往海大 CAS，登入後回到目前頁面；開發模式到模擬登入頁
              (import.meta.env.DEV ? (
                <NavLink to="/login">登入</NavLink>
              ) : (
                <a href={casLoginUrl(location.pathname + location.search)}>登入</a>
              ))}
          </span>
        </nav>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
    </>
  );
}
