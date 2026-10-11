// 變更使用者角色，例如把帳號設為管理員：
//   npm run user:set-role -w backend -- someone@example.com admin
import { closeDb, migrate } from '../../db/index.js';
import { setUserRole } from './auth.service.js';
import { isRole, ROLES } from './roles.js';

const [email, role] = process.argv.slice(2);

if (!email || !isRole(role)) {
  console.error(`用法：npm run user:set-role -w backend -- <email> <${ROLES.join('|')}>`);
  process.exitCode = 1;
} else {
  migrate();
  if (setUserRole(email.toLowerCase(), role)) {
    console.log(`[auth] ${email} 的角色已設為 ${role}`);
  } else {
    console.error(`[auth] 找不到使用者 ${email}`);
    process.exitCode = 1;
  }
  closeDb();
}
