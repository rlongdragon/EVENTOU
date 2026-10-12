export const EVENT_CATEGORIES = ['lecture', 'workshop', 'exhibition', 'sports', 'welfare'] as const;

export type EventCategory = (typeof EVENT_CATEGORIES)[number];
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
}
