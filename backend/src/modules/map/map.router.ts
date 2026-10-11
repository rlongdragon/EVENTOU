import { Router } from 'express';
import { notImplemented } from '../../shared/notImplemented.js';

// 地圖
export const mapRouter = Router();

// TODO(#19): US-04 整合式校園活動地圖，回傳指定範圍／時間內有座標的活動
mapRouter.get('/events', notImplemented('#19'));
