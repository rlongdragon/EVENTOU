import { Navigate, createBrowserRouter } from 'react-router';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { CalendarPage } from '../features/calendars/CalendarPage';
import { AdminDuplicatesPage } from '../features/events/AdminDuplicatesPage';
import { AdminCommentReportsPage } from '../features/events/AdminCommentReportsPage';
import { EventDetailPage } from '../features/events/EventDetailPage';
import { EventSearchPage } from '../features/events/EventSearchPage';
import { AdminSourcesPage } from '../features/sources/AdminSourcesPage';
import { SubmitSourcePage } from '../features/sources/SubmitSourcePage';
import { Layout } from './Layout';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <EventSearchPage /> },
      { path: 'events/:eventId', element: <EventDetailPage /> },
      {
        path: 'map',
        lazy: async () => ({
          Component: (await import('../features/map/CampusMapPage')).CampusMapPage,
        }),
      },
      { path: 'login', element: <LoginPage /> },
      { path: 'calendars', element: <CalendarPage /> },
      // #76 訂閱頁與個人行事曆已整併進行事曆頁，舊網址（含通知信中的連結）導向新頁面
      { path: 'subscriptions', element: <Navigate to="/calendars#follow" replace /> },
      { path: 'calendars/personal/:calendarId', element: <Navigate to="/calendars" replace /> },
      {
        path: 'sources/new',
        element: (
          <RequireAuth>
            <SubmitSourcePage />
          </RequireAuth>
        ),
      },
      {
        path: 'admin/sources',
        element: (
          <RequireAuth role="admin">
            <AdminSourcesPage />
          </RequireAuth>
        ),
      },
      {
        path: 'admin/duplicates',
        element: (
          <RequireAuth role="admin">
            <AdminDuplicatesPage />
          </RequireAuth>
        ),
      },
      {
        path: 'admin/comment-reports',
        element: (
          <RequireAuth role="admin">
            <AdminCommentReportsPage />
          </RequireAuth>
        ),
      },
    ],
  },
]);
