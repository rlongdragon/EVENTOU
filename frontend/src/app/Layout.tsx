import { NavLink, Outlet } from 'react-router';

const NAV_ITEMS = [
  { to: '/', label: '活動' },
  { to: '/map', label: '地圖' },
  { to: '/calendars', label: '行事曆' },
  { to: '/subscriptions', label: '訂閱' },
  { to: '/sources/new', label: '提交來源' },
  { to: '/admin/sources', label: '來源管理' },
  { to: '/login', label: '登入' },
];

export function Layout() {
  return (
    <>
      <header style={{ borderBottom: '1px solid #d0d7de', padding: '0.75rem 1rem' }}>
        <nav style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <strong>EVENTOU</strong>
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '1rem' }}>
        <Outlet />
      </main>
    </>
  );
}
