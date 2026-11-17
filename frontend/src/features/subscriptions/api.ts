import { ApiError } from '../auth/api';

// 追蹤與通知（需登入）：追蹤的類別與來源決定「我的行事曆」的內容，也決定新活動 Email 通知的對象。

export interface CategoryFollow {
  /** 類別代碼 */
  category: string;
  /** 類別顯示名稱，由後端依 EVENT_CATEGORY_LABELS 提供 */
  label: string;
  subscribed: boolean;
}

export interface SourceFollow {
  id: number;
  name: string;
  type: string;
  followed: boolean;
}

/** 每個異動 API 都回傳完整的追蹤狀態。 */
export interface FollowState {
  categories: CategoryFollow[];
  sources: SourceFollow[];
  emailNotifications: boolean;
}

async function request(path: string, init: RequestInit = {}): Promise<FollowState> {
  const response = await fetch(path, {
    ...init,
    headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error ?? 'unknown_error',
      body?.message ?? `HTTP ${response.status}`,
    );
  }
  return body as FollowState;
}

export function fetchFollowState(signal?: AbortSignal): Promise<FollowState> {
  return request('/api/subscriptions', { signal });
}

export function setCategoryFollowed(category: string, followed: boolean): Promise<FollowState> {
  return request(`/api/subscriptions/${encodeURIComponent(category)}`, {
    method: followed ? 'PUT' : 'DELETE',
  });
}

export function setSourceFollowed(sourceId: number, followed: boolean): Promise<FollowState> {
  return request(`/api/subscriptions/sources/${sourceId}`, {
    method: followed ? 'PUT' : 'DELETE',
  });
}

export function setEmailNotifications(enabled: boolean): Promise<FollowState> {
  return request('/api/subscriptions/settings', {
    method: 'PATCH',
    body: JSON.stringify({ emailNotifications: enabled }),
  });
}
