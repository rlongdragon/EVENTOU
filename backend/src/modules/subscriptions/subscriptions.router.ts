import { Router } from 'express';
import { notImplemented } from '../../shared/notImplemented.js';

// 訂閱與通知
export const subscriptionsRouter = Router();

// TODO(#9): US-07 列出／新增／取消訂閱的活動類別（需登入）
subscriptionsRouter.get('/', notImplemented('#9'));
subscriptionsRouter.post('/', notImplemented('#9'));
subscriptionsRouter.delete('/:subscriptionId', notImplemented('#9'));

// TODO(#10): US-08 有符合訂閱的新活動時寄送 Email 通知（背景工作，不一定需要 API）
