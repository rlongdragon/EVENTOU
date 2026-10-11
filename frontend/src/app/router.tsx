import { createBrowserRouter } from 'react-router';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { CalendarsPage } from '../features/calendars/CalendarsPage';
import { EventDetailPage } from '../features/events/EventDetailPage';
import { EventSearchPage } from '../features/events/EventSearchPage';
import { CampusMapPage } from '../features/map/CampusMapPage';
import { AdminSourcesPage } from '../features/sources/AdminSourcesPage';
import { SubmitSourcePage } from '../features/sources/SubmitSourcePage';
import { SubscriptionsPage } from '../features/subscriptions/SubscriptionsPage';
import { Layout } from './Layout';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <EventSearchPage /> },
      { path: 'events/:eventId', element: <EventDetailPage /> },
      { path: 'map', element: <CampusMapPage /> },
      { path: 'login', element: <LoginPage /> },
      {
        path: 'subscriptions',
        element: (
          <RequireAuth>
            <SubscriptionsPage />
          </RequireAuth>
        ),
      },
      { path: 'calendars', element: <CalendarsPage /> },
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
    ],
  },
]);
