// 來源類型與狀態統一定義於此，其他模組（US-14、US-16、US-17）請引用這裡，不要自行寫字串。
// 前端的對應定義在 frontend/src/features/sources/api.ts，兩邊需保持一致。

export const SOURCE_TYPES = [
  'school_site',
  'department_site',
  'club_site',
  'social_media',
  'other',
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export function isSourceType(value: unknown): value is SourceType {
  return SOURCE_TYPES.includes(value as SourceType);
}

// 審核狀態：新提交的來源一律為 pending，由管理員審核（US-14）後變成 approved 或 rejected
export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
