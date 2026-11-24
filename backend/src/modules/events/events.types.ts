/** 活動形式（單選）。值域由程式驗證，資料表不設 CHECK，增減形式不必重建資料表。 */
export const EVENT_CATEGORIES = [
  'lecture',
  'workshop',
  'info_session',
  'competition',
  'exhibition',
  'camp',
  'sports',
  'welfare',
  'other',
] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];
/** 類別顯示名稱；前端與各 API 共用此對照，不要各自寫死。 */
export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  lecture: '講座',
  workshop: '工作坊／研習',
  info_session: '說明會',
  competition: '競賽',
  exhibition: '展覽／表演',
  camp: '營隊／社團活動',
  sports: '運動',
  welfare: '福利／獎助',
  other: '其他',
};

/** 活動主題（可多選），和形式組合使用，例如「講座」＋「資訊科技」。 */
export const EVENT_TOPICS = [
  'it',
  'electrical',
  'engineering',
  'ocean',
  'life_science',
  'business',
  'humanities',
  'arts',
  'language',
  'career',
  'graduate',
  'startup',
  'health',
  'sustainability',
] as const;

export type EventTopic = (typeof EVENT_TOPICS)[number];
export const EVENT_TOPIC_LABELS: Record<EventTopic, string> = {
  it: '資訊科技',
  electrical: '電機電子',
  engineering: '機械與工程',
  ocean: '海洋與水產',
  life_science: '生命科學',
  business: '商管',
  humanities: '人文社會',
  arts: '藝術文化',
  language: '語言與國際交流',
  career: '職涯與實習',
  graduate: '升學',
  startup: '創業',
  health: '健康',
  sustainability: '永續環境',
};

export function isEventTopic(value: unknown): value is EventTopic {
  return EVENT_TOPICS.some((topic) => topic === value);
}

/** 系所代碼。目前只支援資工系（#88：先做資工大學部）。 */
export const DEPARTMENTS = ['csie'] as const;
export type Department = (typeof DEPARTMENTS)[number];
export const DEPARTMENT_LABELS: Record<Department, string> = { csie: '資訊工程學系' };
export function isDepartment(value: unknown): value is Department {
  return DEPARTMENTS.some((department) => department === value);
}
export type EventStatus = 'published' | 'needs_review';

/** US-17 接合介面；缺失值明確傳入 null。 */
export interface RawAnnouncement {
  sourceId: number | null;
  url: string | null;
  title: string | null;
  rawContent: string;
  publishedAt: string | null;
  fetchedAt: string;
}

interface EventFields {
  id: number;
  title: string;
  description: string;
  tags: string[];
  /** 主題（#69），LLM 或關鍵字規則判斷 */
  topics: EventTopic[];
  /** LLM 寫的 2–3 句摘要；沒有 LLM 時為 null */
  summary: string | null;
  /** 公告是否為活動；行政公告（採購、維護等）為 false，不進審核佇列 */
  isEvent: boolean;
  /** 適用對象（#88）：主辦或相關系所、適合年級（1–4，4 代表 4 年級以上） */
  audienceDepartments: Department[];
  audienceGrades: number[];
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  organizer: string | null;
  registrationUrl: string | null;
  sourceId: number;
  originalUrl: string;
  reviewReasons: string[];
  createdAt: string;
  updatedAt: string;
}

/** 發布資料有可供搜尋、行事曆與通知使用的類別與開始時間。 */
export interface PublishedEvent extends EventFields {
  status: 'published';
  category: EventCategory;
  startTime: string;
}

/** 待審資料保留缺漏欄位，避免填入虛構的類別或日期。 */
export interface ReviewEvent extends EventFields {
  status: 'needs_review';
  category: EventCategory | null;
  startTime: string | null;
}

export type Event = PublishedEvent | ReviewEvent;
export type EventDraft =
  | Omit<PublishedEvent, 'id' | 'createdAt' | 'updatedAt'>
  | Omit<ReviewEvent, 'id' | 'createdAt' | 'updatedAt'>;

/** 轉換階段允許缺少追溯鍵；不可直接把這種資料寫入 Event 表。 */
export interface ConvertedAnnouncement extends Omit<
  ReviewEvent,
  'id' | 'createdAt' | 'updatedAt' | 'sourceId' | 'originalUrl' | 'status'
> {
  sourceId: number | null;
  originalUrl: string | null;
  status: EventStatus;
}

export interface ConversionOptions {
  defaultCategory?: EventCategory | null;
  tags?: string[];
  /** LLM 整理結果（#69）；沒有時只用規則擷取 */
  llm?: LlmExtraction | null;
}

/** LLM 從公告整理出的欄位，已經過格式檢查（見 events.llm.ts）；不確定的欄位為 null。 */
export interface LlmExtraction {
  isEvent: boolean;
  title: string | null;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  location: string | null;
  organizer: string | null;
  publishedAt: string | null;
  category: EventCategory | null;
  topics: EventTopic[];
  summary: string | null;
  audienceDepartments: Department[];
  audienceGrades: number[];
  confidence: number;
}
