import { ApiError } from '../auth/api';

export interface CategorySubscription {
  /** 類別代碼 */
  category: string;
  /** 類別顯示名稱，由後端依 EVENT_CATEGORY_LABELS 提供 */
  label: string;
  /** 目前登入的使用者是否已訂閱 */
  subscribed: boolean;
}

async function request(path: string, method = 'GET'): Promise<CategorySubscription[]> {
  const response = await fetch(path, { method });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error ?? 'unknown_error',
      body?.message ?? `HTTP ${response.status}`,
    );
  }
  return (body as { categories: CategorySubscription[] }).categories;
}

/** 取得所有活動類別與自己的訂閱狀態（US-07，需登入）。 */
export function fetchSubscriptions(): Promise<CategorySubscription[]> {
  return request('/api/subscriptions');
}

/** 訂閱或取消訂閱某個類別，回傳更新後的所有類別訂閱狀態。 */
export function setSubscribed(
  category: string,
  subscribed: boolean,
): Promise<CategorySubscription[]> {
  return request(
    `/api/subscriptions/${encodeURIComponent(category)}`,
    subscribed ? 'PUT' : 'DELETE',
  );
}
