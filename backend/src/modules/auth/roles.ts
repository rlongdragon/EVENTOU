// 角色統一定義於此，其他模組請引用這裡，不要自行寫角色字串。
// 訪客（guest）就是未登入（req.user 為 undefined），不是資料庫裡的角色。
export const ROLES = ['user', 'admin'] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return ROLES.includes(value as Role);
}
