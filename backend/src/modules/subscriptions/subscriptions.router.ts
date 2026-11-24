import type { Request, Response } from 'express';
import { Router } from 'express';
import { getDb } from '../../db/index.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { getCalendarSettings, setEmailNotifications } from '../calendars/calendars.mine.js';
import type { EventCategory } from '../events/events.types.js';
import {
  EVENT_CATEGORIES,
  EVENT_CATEGORY_LABELS,
  EVENT_TOPIC_LABELS,
  EVENT_TOPICS,
  isEventTopic,
} from '../events/events.types.js';
import {
  followSource,
  isEventCategory,
  listFollowedTopics,
  listSourceFollows,
  listSubscribedCategories,
  setTopicFollowed,
  subscribeCategory,
  unfollowSource,
  unsubscribeCategory,
} from './subscriptions.service.js';

// 追蹤與通知：追蹤的類別、領域與來源決定「我的行事曆」的內容，也決定新活動 Email 通知的對象
export const subscriptionsRouter = Router();

subscriptionsRouter.use(requireAuth);

/** 所有類別、可追蹤的來源與目前使用者的追蹤狀態；每個異動 API 都回傳同一份，前端不必再查一次。 */
function sendSubscriptions(res: Response, userId: number): void {
  const subscribed = new Set(listSubscribedCategories(userId));
  const followedTopics = new Set(listFollowedTopics(userId));
  res.json({
    categories: EVENT_CATEGORIES.map((category) => ({
      category,
      label: EVENT_CATEGORY_LABELS[category],
      subscribed: subscribed.has(category),
    })),
    topics: EVENT_TOPICS.map((topic) => ({
      topic,
      label: EVENT_TOPIC_LABELS[topic],
      subscribed: followedTopics.has(topic),
    })),
    sources: listSourceFollows(userId),
    emailNotifications: getCalendarSettings(getDb(), userId).emailNotifications,
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

function sendSourceNotFound(res: Response): void {
  res.status(404).json({ error: 'not_found', message: '找不到這個來源' });
}

function parseSourceId(req: Request): number | undefined {
  const value = req.params.sourceId;
  const id = Number(value);
  return typeof value === 'string' && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(id)
    ? id
    : undefined;
}

// 列出所有活動類別、可追蹤的來源、自己的追蹤狀態與 Email 通知開關（需登入）
subscriptionsRouter.get('/', (req, res) => {
  const userId = currentUserId(req, res);
  if (userId === undefined) return;
  sendSubscriptions(res, userId);
});

// Email 通知總開關：關閉後，追蹤的類別或來源有新活動也不寄信
subscriptionsRouter.patch('/settings', (req, res) => {
  const userId = currentUserId(req, res);
  if (userId === undefined) return;
  const enabled: unknown = (req.body as { emailNotifications?: unknown } | undefined)
    ?.emailNotifications;
  if (typeof enabled !== 'boolean') {
    res
      .status(400)
      .json({ error: 'validation_error', message: 'emailNotifications 請使用 true 或 false' });
    return;
  }
  setEmailNotifications(getDb(), userId, enabled);
  sendSubscriptions(res, userId);
});

// 追蹤來源（需登入）；只能追蹤已核准的來源，重複追蹤不會產生第二筆
subscriptionsRouter.put('/sources/:sourceId', (req, res) => {
  const userId = currentUserId(req, res);
  if (userId === undefined) return;
  const sourceId = parseSourceId(req);
  if (sourceId === undefined || !followSource(userId, sourceId)) {
    sendSourceNotFound(res);
    return;
  }
  sendSubscriptions(res, userId);
});

// 取消追蹤來源（需登入）；原本沒追蹤也視為成功
subscriptionsRouter.delete('/sources/:sourceId', (req, res) => {
  const userId = currentUserId(req, res);
  if (userId === undefined) return;
  const sourceId = parseSourceId(req);
  if (sourceId === undefined) {
    sendSourceNotFound(res);
    return;
  }
  unfollowSource(userId, sourceId);
  sendSubscriptions(res, userId);
});

// 追蹤內容領域（需登入）；和帳號頁的偏好領域（#98）是同一份設定
subscriptionsRouter.put('/topics/:topic', (req, res) => setTopic(req, res, true));
subscriptionsRouter.delete('/topics/:topic', (req, res) => setTopic(req, res, false));

function setTopic(req: Request, res: Response, followed: boolean): void {
  const userId = currentUserId(req, res);
  if (userId === undefined) return;
  const { topic } = req.params;
  if (!isEventTopic(topic)) {
    res.status(404).json({ error: 'not_found', message: '找不到這個領域' });
    return;
  }
  setTopicFollowed(userId, topic, followed);
  sendSubscriptions(res, userId);
}

// US-07 追蹤類別（需登入）；重複追蹤不會產生第二筆
subscriptionsRouter.put('/:category', (req, res) => {
  const userId = currentUserId(req, res);
  if (userId === undefined) return;
  const category = parseCategory(req, res);
  if (!category) return;
  subscribeCategory(userId, category);
  sendSubscriptions(res, userId);
});

// US-07 取消追蹤類別（需登入）；原本沒追蹤也視為成功
subscriptionsRouter.delete('/:category', (req, res) => {
  const userId = currentUserId(req, res);
  if (userId === undefined) return;
  const category = parseCategory(req, res);
  if (!category) return;
  unsubscribeCategory(userId, category);
  sendSubscriptions(res, userId);
});

// US-08 新活動 Email 通知沒有 HTTP API，由 subscriptions.scheduler.ts 的背景排程處理
