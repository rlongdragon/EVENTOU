import { createHash, randomBytes } from 'node:crypto';
import { getDb } from '../../db/index.js';
import type { Role } from './roles.js';

export interface User {
  id: number;
  /** CAS 回傳的學號；#90 改版前建立的帳號沒有學號 */
  studentId: string | null;
  /** 新活動通知信箱（US-08），可為空 */
  email: string | null;
  displayName: string;
  role: Role;
  createdAt: string;
}

interface UserRow {
  id: number;
  student_id: string | null;
  email: string | null;
  display_name: string;
  role: Role;
  created_at: string;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_SCHOOL_EMAIL_DOMAIN = 'mail.ntou.edu.tw';

function toUser(row: UserRow): User {
  return {
    id: row.id,
    studentId: row.student_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
  };
}

/**
 * 預設顯示名稱：學號只留前 5 碼（入學年度與系所代碼），其餘遮成 `*`，例如 01357107 → 01357*。
 * 留言等公開位置看得出是哪個系，但不露出完整學號；本人在帳號頁看得到完整學號。
 */
export function maskStudentId(studentId: string): string {
  const visible = studentId.length > 5 ? 5 : Math.max(0, studentId.length - 2);
  return `${studentId.slice(0, visible)}*`;
}

/** 預設通知信箱：學號@學校信箱網域；SCHOOL_EMAIL_DOMAIN 設為空字串時不預設 */
export function defaultSchoolEmail(studentId: string): string | null {
  const domain = process.env.SCHOOL_EMAIL_DOMAIN ?? DEFAULT_SCHOOL_EMAIL_DOMAIN;
  return domain ? `${studentId.toLowerCase()}@${domain}` : null;
}

/** 以 CAS 驗證過的學號取得會員資料，第一次登入時自動建立。 */
export function findOrCreateUserByStudentId(studentId: string): User {
  const db = getDb();
  db.prepare(
    `INSERT INTO users (student_id, email, display_name) VALUES (?, ?, ?)
    ON CONFLICT (student_id) DO NOTHING`,
  ).run(studentId, defaultSchoolEmail(studentId), maskStudentId(studentId));
  return toUser(
    db.prepare('SELECT * FROM users WHERE student_id = ?').get(studentId) as unknown as UserRow,
  );
}

/** 更新本人的顯示名稱與通知信箱；欄位須先驗證，undefined 表示不變。 */
export function updateUserProfile(
  userId: number,
  input: { displayName?: string; email?: string | null },
): User {
  const db = getDb();
  if (input.displayName !== undefined) {
    db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(input.displayName, userId);
  }
  if (input.email !== undefined) {
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(input.email, userId);
  }
  return toUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as UserRow);
}

/** 變更使用者角色，找不到該學號時回傳 false。 */
export function setUserRole(studentId: string, role: Role): boolean {
  const result = getDb()
    .prepare('UPDATE users SET role = ? WHERE student_id = ?')
    .run(role, studentId);
  return Number(result.changes) > 0;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(userId: number): { token: string; expiresAt: Date } {
  const db = getDb();
  const now = new Date();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now.toISOString());
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
    hashToken(token),
    userId,
    expiresAt.toISOString(),
  );
  return { token, expiresAt };
}

export function findUserBySessionToken(token: string): User | undefined {
  const row = getDb()
    .prepare(
      `SELECT users.* FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.id = ? AND sessions.expires_at > ?`,
    )
    .get(hashToken(token), new Date().toISOString()) as UserRow | undefined;
  return row && toUser(row);
}

export function deleteSession(token: string): void {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(hashToken(token));
}
