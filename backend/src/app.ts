import express from 'express';
import { authenticate } from './modules/auth/auth.middleware.js';
import { authRouter } from './modules/auth/auth.router.js';
import { calendarsRouter } from './modules/calendars/calendars.router.js';
import { eventsRouter } from './modules/events/events.router.js';
import { healthRouter } from './modules/health/health.router.js';
import { mapRouter } from './modules/map/map.router.js';
import { sourcesRouter } from './modules/sources/sources.router.js';
import { subscriptionsRouter } from './modules/subscriptions/subscriptions.router.js';

export function createApp() {
  const app = express();

  app.use(express.json());
  app.use(authenticate);

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/sources', sourcesRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/subscriptions', subscriptionsRouter);
  app.use('/api/calendars', calendarsRouter);
  app.use('/api/map', mapRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  return app;
}
