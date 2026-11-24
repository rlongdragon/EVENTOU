// 變更使用者角色，例如把帳號設為管理員（該學號須先以海大 CAS 登入過一次）：
//   npm run user:set-role -w backend -- 01357107 admin
import { closeDb, migrate } from '../../db/index.js';
import { setUserRole } from './auth.service.js';
import { isRole, ROLES } from './roles.js';

const [studentId, role] = process.argv.slice(2);

if (!studentId || !isRole(role)) {
  console.error(`用法：npm run user:set-role -w backend -- <學號> <${ROLES.join('|')}>`);
  process.exitCode = 1;
} else {
  migrate();
  if (setUserRole(studentId, role)) {
    console.log(`[auth] 已把該學號的角色設為 ${role}`);
  } else {
    console.error('[auth] 找不到這個學號的使用者，請先以海大 CAS 登入一次');
    process.exitCode = 1;
  }
  closeDb();
}
