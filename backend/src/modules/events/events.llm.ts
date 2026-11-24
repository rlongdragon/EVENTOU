import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { cleanAnnouncement } from './events.cleaner.js';
import { isTaipeiTimestamp } from './events.dates.js';
import {
  DEPARTMENT_LABELS,
  EVENT_CATEGORIES,
  EVENT_CATEGORY_LABELS,
  EVENT_TOPIC_LABELS,
  isDepartment,
  isEventTopic,
  type EventCategory,
  type LlmExtraction,
  type RawAnnouncement,
} from './events.types.js';

// #69 用 LLM 整理公告：判斷是否為活動、擷取欄位、分類與摘要。
// 介面是 OpenAI 相容的 chat completions，沒設定 LLM_BASE_URL／LLM_MODEL 時不呼叫，退回規則擷取。

export interface LlmConfig {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  timeoutMs: number;
}

export function llmConfigFromEnv(env = process.env): LlmConfig | null {
  const baseUrl = env.LLM_BASE_URL?.trim();
  const model = env.LLM_MODEL?.trim();
  if (!baseUrl || !model) return null;
  const timeoutMs = Number(env.LLM_TIMEOUT_MS);
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey: env.LLM_API_KEY?.trim() || null,
    model,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60000,
  };
}

/** 送給 LLM 的公告內文上限，避免超長頁面耗費大量 token。 */
const MAX_CONTENT_CHARS = 6000;

const list = (labels: Record<string, string>) =>
  Object.entries(labels)
    .map(([code, label]) => `${code}=${label}`)
    .join('、');

const SYSTEM_PROMPT = `你是國立臺灣海洋大學校園活動平台的公告整理助手。讀一則學校公告，只輸出一個 JSON 物件，不要有其他文字。

欄位：
- isEvent：公告是不是一場學生可以參加的活動（講座、工作坊、說明會、競賽、展覽、表演、營隊、運動賽事、福利發放等）。採購、招標、報帳、系統維護、停水停電、行政規定、法規修訂、人事異動、純新聞報導、得獎賀詞都是 false。
- title：活動名稱（簡潔，不含「轉知」「公告」等字樣）。
- startTime、endTime：活動開始、結束時間，格式 YYYY-MM-DDTHH:mm:ss+08:00。只有日期沒有時間時用 00:00:00 並把 allDay 設 true；多日全天活動的 endTime 是最後一天的隔天 00:00:00。民國年要換成西元年（民國年＋1911）。報名期限不是活動時間。找不到就填 null，不要猜。
- allDay：布林值。
- location：活動地點；線上活動填「線上」。沒有就 null。
- organizer：主辦單位。沒有就 null。
- publishedAt：公告的發布日期（YYYY-MM-DD），內文沒寫就 null。
- category：活動形式，必填一個代碼：${list(EVENT_CATEGORY_LABELS)}。
- topics：活動主題代碼陣列，0–3 個：${list(EVENT_TOPIC_LABELS)}。
- summary：給學生看的摘要，2–3 句、80 字內，寫活動內容與對象，不要重複時間地點。不是活動時填 null。
- audienceDepartments：主辦或明確針對的系所代碼陣列：${list(DEPARTMENT_LABELS)}；全校性活動填 []。
- audienceGrades：明確限定的年級陣列（1–4，4 代表 4 年級以上，研究生不算）；沒有限定填 []。
- confidence：0 到 1，你對整理結果的信心。`;

function userPrompt(raw: RawAnnouncement): string {
  const content = cleanAnnouncement(raw.rawContent).text.slice(0, MAX_CONTENT_CHARS);
  const title = cleanAnnouncement(raw.title ?? '').text;
  return [
    `公告標題：${title || '（無）'}`,
    `列表上的發布日期：${raw.publishedAt ?? '（無）'}`,
    `擷取時間：${raw.fetchedAt}`,
    `公告網址：${raw.url ?? '（無）'}`,
    '公告內文：',
    content || '（無）',
  ].join('\n');
}

/** 快取鍵：模型看得到的內容相同，結果就可以沿用。 */
export function extractionHash(raw: RawAnnouncement): string {
  return createHash('sha256')
    .update(JSON.stringify([raw.title, raw.rawContent, raw.publishedAt, raw.url]))
    .digest('hex');
}

const text = (value: unknown, max = 200): string | null =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

/** 檢查並正規化 LLM 回傳的 JSON；格式不對的欄位當成沒給。完全無法解讀時回傳 null。 */
export function parseExtraction(content: string): LlmExtraction | null {
  const json = content.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (
    typeof data !== 'object' ||
    data === null ||
    typeof (data as { isEvent?: unknown }).isEvent !== 'boolean'
  )
    return null;
  const value = data as Record<string, unknown>;
  const timestamp = (field: unknown) =>
    typeof field === 'string' && isTaipeiTimestamp(field) ? field : null;
  const category = EVENT_CATEGORIES.find((code) => code === value.category) ?? null;
  const array = (field: unknown): unknown[] => (Array.isArray(field) ? field : []);
  const confidence = Number(value.confidence);
  const publishedAt = text(value.publishedAt, 10);
  return {
    isEvent: value.isEvent as boolean,
    title: text(value.title),
    startTime: timestamp(value.startTime),
    endTime: timestamp(value.endTime),
    allDay: value.allDay === true,
    location: text(value.location),
    organizer: text(value.organizer),
    publishedAt: publishedAt && /^\d{4}-\d{2}-\d{2}$/.test(publishedAt) ? publishedAt : null,
    category: category as EventCategory | null,
    topics: [...new Set(array(value.topics).filter(isEventTopic))].slice(0, 3),
    summary: text(value.summary, 160),
    audienceDepartments: [...new Set(array(value.audienceDepartments).filter(isDepartment))],
    audienceGrades: [
      ...new Set(
        array(value.audienceGrades).filter(
          (grade): grade is number =>
            Number.isInteger(grade) && Number(grade) >= 1 && Number(grade) <= 4,
        ),
      ),
    ],
    confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
  };
}

export type ChatFetch = typeof fetch;

/** 呼叫 LLM 一次；網路錯誤、逾時、非 2xx 都丟出例外，由呼叫端退回規則。 */
async function requestExtraction(
  config: LlmConfig,
  raw: RawAnnouncement,
  fetchImpl: ChatFetch,
): Promise<LlmExtraction> {
  const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      max_tokens: 800,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt(raw) },
      ],
    }),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) throw new Error(`LLM 回應 ${response.status}`);
  const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
  const content = body.choices?.[0]?.message?.content;
  const extraction = typeof content === 'string' ? parseExtraction(content) : null;
  if (!extraction) throw new Error('LLM 回傳格式無法解讀');
  return extraction;
}

/**
 * 取得公告的 LLM 整理結果：先查快取，沒有才呼叫並寫入快取。
 * 沒有設定或呼叫失敗時回傳 null，由規則擷取接手；失敗原因透過 onError 回報。
 */
export async function extractWithLlm(
  db: DatabaseSync,
  raw: RawAnnouncement,
  config: LlmConfig | null = llmConfigFromEnv(),
  fetchImpl: ChatFetch = fetch,
  onError: (error: unknown) => void = (error) => console.error('[llm]', error),
): Promise<LlmExtraction | null> {
  if (!config) return null;
  const hash = extractionHash(raw);
  const cached = db
    .prepare('SELECT result FROM llm_extractions WHERE content_hash = ? AND model = ?')
    .get(hash, config.model);
  if (cached) return parseExtraction(String(cached.result));
  try {
    const extraction = await requestExtraction(config, raw, fetchImpl);
    db.prepare(
      'INSERT OR REPLACE INTO llm_extractions (content_hash, model, result) VALUES (?, ?, ?)',
    ).run(hash, config.model, JSON.stringify(extraction));
    return extraction;
  } catch (error) {
    onError(error);
    return null;
  }
}
