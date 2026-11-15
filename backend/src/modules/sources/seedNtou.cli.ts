// 一次建立海大官方公告列表的來源（已核准、啟用中），新環境不必逐一提交與審核：
//   npm run sources:seed-ntou -w backend -- admin@example.com
// 指定的帳號須為管理員，會記為提交者與審核者；已存在相同網址的來源會略過。
import { closeDb, getDb, migrate } from '../../db/index.js';
import { seedNtouSources } from './ntouSources.js';

const [email] = process.argv.slice(2);

if (!email) {
  console.error('用法：npm run sources:seed-ntou -w backend -- <管理員 email>');
  process.exitCode = 1;
} else {
  migrate();
  const admin = getDb()
    .prepare('SELECT id, role FROM users WHERE email = ?')
    .get(email.toLowerCase());
  if (!admin) {
    console.error(`[sources] 找不到使用者 ${email}`);
    process.exitCode = 1;
  } else if (admin.role !== 'admin') {
    console.error(`[sources] ${email} 不是管理員，請先執行 npm run user:set-role`);
    process.exitCode = 1;
  } else {
    const { created, skipped } = seedNtouSources(getDb(), Number(admin.id));
    console.log(`[sources] 已建立 ${created.length} 個來源，略過 ${skipped.length} 個已存在的來源`);
    for (const name of created) console.log(`  + ${name}`);
  }
  closeDb();
}
