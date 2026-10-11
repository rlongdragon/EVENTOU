import { createHash, randomBytes } from 'node:crypto';
import { getDb } from '../../db/index.js';
import type { Role } from './roles.js';

export interface User {
  id: number;
  email: string;
  displayName: string;
  role: Role;
  createdAt: string;
}

interface UserRow {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  role: Role;
  created_at: string;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
  };
}

export function findUserByEmail(email: string): { user: User; passwordHash: string } | undefined {
  const row = getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as
    UserRow | undefined;
  return row && { user: toUser(row), passwordHash: row.password_hash };
}

export function createUser(input: {
  email: string;
  displayName: string;
  passwordHash: string;
}): User {
  const row = getDb()
    .prepare('INSERT INTO users (email, display_name, password_hash) VALUES (?, ?, ?) RETURNING *')
    .get(input.email, input.displayName, input.passwordHash) as unknown as UserRow;
  return toUser(row);
}

/** 變更使用者角色，找不到使用者時回傳 false。 */
export function setUserRole(email: string, role: Role): boolean {
  const result = getDb().prepare('UPDATE users SET role = ? WHERE email = ?').run(role, email);
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
