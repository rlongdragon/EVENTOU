// 把重試用盡（failed）的通知改回待寄送，下一輪通知排程會重新寄出：
//   npm run notifications:retry -w backend
import { closeDb, migrate } from '../../db/index.js';
import { retryFailedNotifications } from './subscriptions.notifier.js';

migrate();
console.log(`[notifications] ${retryFailedNotifications()} 封失敗的通知已排入重試`);
closeDb();
