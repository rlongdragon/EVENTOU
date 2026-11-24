import { getDb } from '../../db/index.js';
import { createSession } from './auth.service.js';
import type { Role } from './roles.js';

let nextStudentId = 1;

/**
 * 測試用：直接建立一位已登入的使用者（#90 改用 CAS 後沒有註冊 API）。
 * 回傳的 cookie 可放進 Cookie header；email 預設為 `<學號>@example.com`，傳 null 表示沒有通知信箱。
 */
export function createTestUser(
  input: {
    studentId?: string;
    displayName?: string;
    email?: string | null;
    role?: Role;
  } = {},
): { id: number; cookie: string; studentId: string } {
  const studentId = input.studentId ?? `T${String(nextStudentId++).padStart(7, '0')}`;
  const row = getDb()
    .prepare(
      `INSERT INTO users (student_id, email, display_name, role) VALUES (?, ?, ?, ?)
      RETURNING id`,
    )
    .get(
      studentId,
      input.email === undefined ? `${studentId.toLowerCase()}@example.com` : input.email,
      input.displayName ?? studentId,
      input.role ?? 'user',
    );
  const id = Number(row?.id);
  const { token } = createSession(id);
  return { id, cookie: `eventou_session=${encodeURIComponent(token)}`, studentId };
}
