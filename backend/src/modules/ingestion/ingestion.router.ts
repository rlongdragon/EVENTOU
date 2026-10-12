import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { requireRole } from '../auth/auth.middleware.js';
import { getIngestionService, IngestionError } from './ingestion.service.js';
export const ingestionRouter = Router();
ingestionRouter.use(requireRole('admin'));
ingestionRouter.post('/:sourceId/fetch', async (req, res, next) => {
  const sourceId = Number(req.params.sourceId);
  if (!Number.isSafeInteger(sourceId) || sourceId <= 0) {
    res.status(400).json({ error: 'invalid_source_id' });
    return;
  }
  try {
    const run = await getIngestionService().runSource(sourceId);
    res.status(run.status === 'failure' ? 502 : 200).json({ run });
  } catch (error) {
    if (error instanceof IngestionError) res.status(error.status).json({ error: error.message });
    else next(error);
  }
});
ingestionRouter.get('/:sourceId/runs', (req, res) => {
  const sourceId = Number(req.params.sourceId);
  if (!Number.isSafeInteger(sourceId) || sourceId <= 0) {
    res.status(400).json({ error: 'invalid_source_id' });
    return;
  }
  res.json({
    runs: getDb()
      .prepare('SELECT * FROM ingestion_runs WHERE source_id=? ORDER BY id DESC LIMIT 100')
      .all(sourceId),
  });
});
