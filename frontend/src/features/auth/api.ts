// 與 backend/src/modules/auth/roles.ts 的 ROLES 保持一致；訪客 = 未登入（user 為 null）
export type Role = 'user' | 'admin';

export interface User {
  id: number;
  email: string;
  displayName: string;
  role: Role;
  createdAt: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput extends LoginInput {
  displayName: string;
}

/** 後端回傳的錯誤，fields 為各欄位的錯誤訊息。 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error ?? 'unknown_error',
      body?.message ?? `HTTP ${response.status}`,
      body?.fields,
    );
  }
  return body as T;
}

/** 取得目前登入的使用者，訪客回傳 null。 */
export async function fetchCurrentUser(signal?: AbortSignal): Promise<User | null> {
  try {
    const { user } = await request<{ user: User }>('/api/auth/me', { signal });
    return user;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export async function login(input: LoginInput): Promise<User> {
  const { user } = await request<{ user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return user;
}

export async function register(input: RegisterInput): Promise<User> {
  const { user } = await request<{ user: User }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return user;
}

export async function logout(): Promise<void> {
  await request<void>('/api/auth/logout', { method: 'POST' });
}
