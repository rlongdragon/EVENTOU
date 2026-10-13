import type { Request, Response } from 'express';
import { Router } from 'express';
import { requireAuth } from '../auth/auth.middleware.js';
import type { EventCategory } from '../events/events.types.js';
import { EVENT_CATEGORIES, EVENT_CATEGORY_LABELS } from '../events/events.types.js';
import {
  isEventCategory,
  listSubscribedCategories,
  subscribeCategory,
  unsubscribeCategory,
} from './subscriptions.service.js';

// 訂閱與通知
export const subscriptionsRouter = Router();

subscriptionsRouter.use(requireAuth);

/** 所有類別與目前使用者的訂閱狀態；訂閱按鈕與「我的訂閱」共用同一份回應。 */
function sendSubscriptions(res: Response, userId: number): void {
  const subscribed = new Set(listSubscribedCategories(userId));
  res.json({
    categories: EVENT_CATEGORIES.map((category) => ({
      category,
      label: EVENT_CATEGORY_LABELS[category],
      subscribed: subscribed.has(category),
    })),
  });
}

/** requireAuth 已擋下訪客；這裡再確認一次，讓型別上也拿得到使用者 id。 */
function currentUserId(req: Request, res: Response): number | undefined {
  const userId = req.user?.id;
  if (userId === undefined) res.status(401).json({ error: 'unauthorized', message: '請先登入' });
  return userId;
}

/** 取出路徑上的類別代碼；不是已知類別時回 404 並回傳 undefined。 */
function parseCategory(req: Request, res: Response): EventCategory | undefined {
  const { category } = req.params;
  if (isEventCategory(category)) return category;
  res.status(404).json({ error: 'not_found', message: '找不到這個活動類別' });
  return undefined;
}

// US-07 列出所有活動類別與自己的訂閱狀態（需登入）
subscriptionsRouter.get('/', (req, res) => {
  const userId = currentUserId(req, res);
  if (userId === undefined) return;
  sendSubscriptions(res, userId);
});

// US-07 訂閱類別（需登入）；重複訂閱不會產生第二筆
subscriptionsRouter.put('/:category', (req, res) => {
  const userId = currentUserId(req, res);
  if (userId === undefined) return;
  const category = parseCategory(req, res);
  if (!category) return;
  subscribeCategory(userId, category);
  sendSubscriptions(res, userId);
});

// US-07 取消訂閱（需登入）；原本沒訂閱也視為成功
subscriptionsRouter.delete('/:category', (req, res) => {
  const userId = currentUserId(req, res);
  if (userId === undefined) return;
  const category = parseCategory(req, res);
  if (!category) return;
  unsubscribeCategory(userId, category);
  sendSubscriptions(res, userId);
});

// US-08 新活動 Email 通知沒有 HTTP API，由 subscriptions.scheduler.ts 的背景排程處理
