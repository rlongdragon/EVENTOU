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

/**
 * 內容領域（可多選，欄位名稱沿用 topics），和資訊類別（category）組合使用，例如「講座」＋「資安」。
 * 使用者的偏好標籤（#98）也從這份清單挑，活動與偏好才對得上。
 */
export const EVENT_TOPICS = [
  'it',
  'security',
  'ai',
  'electrical',
  'mechanical',
  'maritime',
  'ocean_science',
  'aquaculture',
  'food',
  'life_medical',
  'sustainability',
  'business',
  'law',
  'language',
  'international',
  'humanities',
  'arts',
  'performing',
  'mental_health',
  'healthcare',
  'ball_sports',
  'water_activities',
  'outdoor',
  'career',
  'graduate',
  'startup',
  'volunteer',
] as const;

export type EventTopic = (typeof EVENT_TOPICS)[number];
export const EVENT_TOPIC_LABELS: Record<EventTopic, string> = {
  it: '資訊',
  security: '資安',
  ai: 'AI／資料科學',
  electrical: '電機電子',
  mechanical: '機械工程',
  maritime: '造船航運',
  ocean_science: '海洋科學',
  aquaculture: '水產養殖',
  food: '食品',
  life_medical: '生命醫藥',
  sustainability: '環境永續',
  business: '商管金融',
  law: '法律',
  language: '語言',
  international: '國際交流',
  humanities: '人文歷史',
  arts: '藝術設計',
  performing: '音樂表演',
  mental_health: '心理健康',
  healthcare: '醫療保健',
  ball_sports: '球類運動',
  water_activities: '水上活動',
  outdoor: '戶外活動',
  career: '職涯實習',
  graduate: '升學',
  startup: '創業',
  volunteer: '志工服務',
};

export function isEventTopic(value: unknown): value is EventTopic {
  return EVENT_TOPICS.some((topic) => topic === value);
}

/** 資訊受眾（可多選）：活動開放或主要針對的對象。 */
export const EVENT_AUDIENCES = [
  'all_students',
  'undergraduate',
  'graduate',
  'department',
  'staff',
  'public',
] as const;
export type EventAudience = (typeof EVENT_AUDIENCES)[number];
export const EVENT_AUDIENCE_LABELS: Record<EventAudience, string> = {
  all_students: '全校學生',
  undergraduate: '大學部',
  graduate: '研究生',
  department: '特定系所',
  staff: '教職員',
  public: '校外人士',
};
export function isEventAudience(value: unknown): value is EventAudience {
  return EVENT_AUDIENCES.some((audience) => audience === value);
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
  /** 資訊受眾：開放或主要針對的對象 */
  audiences: EventAudience[];
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
  audiences: EventAudience[];
  audienceDepartments: Department[];
  audienceGrades: number[];
  confidence: number;
}
