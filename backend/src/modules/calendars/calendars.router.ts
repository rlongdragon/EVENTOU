import { Router } from 'express';
import { notImplemented } from '../../shared/notImplemented.js';
import { requireAuth } from '../auth/auth.middleware.js';

// 行事曆（iCal）
export const calendarsRouter = Router();

// TODO(#8): US-05 依類別提供公開 iCal 行事曆（未登入可訂閱）
calendarsRouter.get('/categories/:category.ics', notImplemented('#8'));

// TODO(#11): US-09 依類別與標籤建立個人行事曆（需登入，沿用 #8 的 iCal 產生邏輯）
calendarsRouter.post('/personal', requireAuth, notImplemented('#11'));
calendarsRouter.get('/personal/:token.ics', notImplemented('#11'));
