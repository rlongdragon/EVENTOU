import { Router } from 'express';
import { notImplemented } from '../../shared/notImplemented.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';

// 活動資訊來源（Source）：審核狀態與啟用狀態分開管理
export const sourcesRouter = Router();

// TODO(#21): US-13 提交新的活動資訊來源（需登入）
sourcesRouter.post('/', requireAuth, notImplemented('#21'));
// TODO(#21): 列出來源（一般使用者只看到已核准的來源）
sourcesRouter.get('/', notImplemented('#21'));

// TODO(#22): US-14 管理員審核來源（核准／退回）
sourcesRouter.post('/:sourceId/review', requireRole('admin'), notImplemented('#22'));

// TODO(#23): US-15 來源可信度／風險提示
sourcesRouter.get('/:sourceId/risk', notImplemented('#23'));

// TODO(#24): US-16 管理員啟用／停用來源
sourcesRouter.patch('/:sourceId/enabled', requireRole('admin'), notImplemented('#24'));
