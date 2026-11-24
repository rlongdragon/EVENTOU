// 與 backend/src/modules/auth/roles.ts 的 ROLES 保持一致；訪客 = 未登入（user 為 null）
export type Role = 'user' | 'admin';

export interface User {
  id: number;
  /** 海大 CAS 回傳的學號；只有本人看得到 */
  studentId: string | null;
  /** 新活動通知信箱，null 表示不寄 */
  email: string | null;
  displayName: string;
  role: Role;
  createdAt: string;
  /** #88 個人化推薦：系所代碼（目前只有 csie）、入學學年（民國）、由後端推算的年級 */
  department: string | null;
  admissionYear: number | null;
  grade: number | null;
  personalize: boolean;
  /** #98 自我描述與確認過的偏好領域代碼 */
  interestDescription: string | null;
  interestTopics: string[];
}

export interface ProfileInput {
  displayName?: string;
  email?: string;
  department?: string | null;
  admissionYear?: number | null;
  personalize?: boolean;
  interestDescription?: string;
  interestTopics?: string[];
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

/** 以海大 CAS 登入的網址，登入完成後回到 redirect（站內路徑） */
export function casLoginUrl(redirect = '/'): string {
  return `/api/auth/cas/login?redirect=${encodeURIComponent(redirect)}`;
}

/** 開發模式的模擬登入（npm run dev 才開啟，正式環境停用） */
export async function devLogin(studentId: string, role: Role): Promise<User> {
  const { user } = await request<{ user: User }>('/api/auth/dev-login', {
    method: 'POST',
    body: JSON.stringify({ studentId, role }),
  });
  return user;
}

export async function updateProfile(input: ProfileInput): Promise<User> {
  const { user } = await request<{ user: User }>('/api/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  return user;
}

/** #98 依自我描述請 AI 建議偏好領域；AI 無法使用時回傳 null，改由使用者手動勾選 */
export async function suggestInterests(description: string): Promise<string[] | null> {
  try {
    const { topics } = await request<{ topics: string[] }>('/api/auth/me/interests/suggest', {
      method: 'POST',
      body: JSON.stringify({ description }),
    });
    return topics;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 503 || error.status === 429)) return null;
    throw error;
  }
}

/** 登出本站；cas 為 true 時回傳海大 CAS 的登出網址，由呼叫端導過去 */
export async function logout(cas = false): Promise<string | null> {
  const { casLogoutUrl } = await request<{ casLogoutUrl: string | null }>('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ cas }),
  });
  return casLogoutUrl;
}
