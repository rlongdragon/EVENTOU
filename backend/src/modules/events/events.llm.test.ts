import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { migrate } from '../../db/index.js';
import { seedSources } from '../sources/sources.testHelpers.js';
import { NOT_EVENT_REASON, convertAnnouncement } from './events.converter.js';
import { extractWithLlm, llmConfigFromEnv, parseExtraction, type LlmConfig } from './events.llm.js';
import {
  currentAcademicYear,
  gradeFromAdmissionYear,
  profileFromStudentId,
  relevanceScore,
} from './events.relevance.js';
import { processAnnouncementWithLlm } from './events.service.js';
import type { LlmExtraction, RawAnnouncement } from './events.types.js';

process.env.DATABASE_PATH = ':memory:';
const reference = '2026-10-01T09:00:00+08:00';
const raw: RawAnnouncement = {
  sourceId: 1,
  url: 'https://www.ntou.edu.tw/news/1',
  title: '轉知：生成式 AI 應用講座',
  rawContent: '本校資工系邀請業界講者分享生成式 AI 的應用。時間：十月七日下午兩點。',
  publishedAt: null,
  fetchedAt: reference,
};
const extraction: LlmExtraction = {
  isEvent: true,
  title: '生成式 AI 應用講座',
  startTime: '2026-10-07T14:00:00+08:00',
  endTime: '2026-10-07T16:00:00+08:00',
  allDay: false,
  location: '資工系館 INS201',
  organizer: '資訊工程學系',
  publishedAt: '2026-09-30',
  category: 'lecture',
  topics: ['it'],
  audiences: ['all_students'],
  summary: '業界講者分享生成式 AI 的實務應用。',
  audienceDepartments: ['csie'],
  audienceGrades: [],
  confidence: 0.9,
};
const config: LlmConfig = {
  baseUrl: 'http://llm.test/v1',
  apiKey: 'k',
  model: 'm',
  timeoutMs: 1000,
};

function chatResponse(content: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status });
}

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  seedSources(db, 1);
  return db;
}

test('沒設定 LLM 環境變數時不啟用', () => {
  assert.equal(llmConfigFromEnv({}), null);
  assert.equal(llmConfigFromEnv({ LLM_BASE_URL: 'http://x/v1/' })?.model, undefined);
  assert.deepEqual(llmConfigFromEnv({ LLM_BASE_URL: 'http://x/v1/', LLM_MODEL: 'sonnet' }), {
    baseUrl: 'http://x/v1',
    apiKey: null,
    model: 'sonnet',
    timeoutMs: 60000,
  });
});

test('解析 LLM 回傳：去掉 code fence，格式不對的欄位當成沒給', () => {
  const parsed = parseExtraction(
    '```json\n' +
      JSON.stringify({
        isEvent: true,
        startTime: '2026/10/07 14:00',
        category: 'party',
        topics: ['it', 'it', 'nope', 'career', 'arts', 'health'],
        audienceDepartments: ['csie', 'ee'],
        audienceGrades: [1, 5, 2.5, 4],
        publishedAt: '民國115年',
        confidence: 3,
      }) +
      '\n```',
  );
  assert.ok(parsed);
  assert.equal(parsed.startTime, null);
  assert.equal(parsed.category, null);
  assert.deepEqual(parsed.topics, ['it', 'career', 'arts']);
  assert.deepEqual(parsed.audienceDepartments, ['csie']);
  assert.deepEqual(parsed.audienceGrades, [1, 4]);
  assert.equal(parsed.publishedAt, null);
  assert.equal(parsed.confidence, 1);
  assert.equal(parseExtraction('不是 JSON'), null);
  assert.equal(parseExtraction('{"title":"缺 isEvent"}'), null);
});

test('LLM 結果覆寫規則擷取的欄位，仍經過驗證', () => {
  const event = convertAnnouncement(raw, { llm: extraction });
  assert.equal(event.status, 'published');
  assert.equal(event.category, 'lecture');
  assert.deepEqual(event.topics, ['it']);
  assert.equal(event.summary, extraction.summary);
  assert.equal(event.startTime, extraction.startTime);
  assert.equal(event.location, extraction.location);
  assert.deepEqual(event.audienceDepartments, ['csie']);

  const ruleOnly = convertAnnouncement(raw);
  assert.equal(ruleOnly.status, 'needs_review');
  assert.equal(ruleOnly.summary, null);
  assert.deepEqual(ruleOnly.topics, ['ai', 'it']);
});

test('行政公告標成非活動，低信心維持待審核', () => {
  const notEvent = convertAnnouncement(raw, { llm: { ...extraction, isEvent: false } });
  assert.equal(notEvent.status, 'needs_review');
  assert.equal(notEvent.isEvent, false);
  assert.ok(notEvent.reviewReasons.includes(NOT_EVENT_REASON));
  const unsure = convertAnnouncement(raw, { llm: { ...extraction, confidence: 0.3 } });
  assert.equal(unsure.status, 'needs_review');
});

test('呼叫 LLM 一次後寫入快取，失敗時退回規則', async () => {
  const db = freshDb();
  let calls = 0;
  const fetchOk = (async () => {
    calls += 1;
    return chatResponse(JSON.stringify(extraction));
  }) as typeof fetch;
  assert.deepEqual(await extractWithLlm(db, raw, config, fetchOk), extraction);
  assert.deepEqual(await extractWithLlm(db, raw, config, fetchOk), extraction);
  assert.equal(calls, 1);

  const errors: unknown[] = [];
  const fetchFail = (async () => chatResponse('', 500)) as typeof fetch;
  const changed = { ...raw, rawContent: raw.rawContent + '（更新）' };
  assert.equal(await extractWithLlm(db, changed, config, fetchFail, (e) => errors.push(e)), null);
  assert.equal(errors.length, 1);
  assert.equal(await extractWithLlm(db, changed, null, fetchFail), null);
});

test('擷取流程用 LLM 讀到的日期補上缺少的發布日期', async () => {
  const db = freshDb();
  db.prepare(
    'INSERT INTO raw_announcements(source_id, url, title, raw_content, published_at, fetched_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(1, raw.url, raw.title, raw.rawContent, null, raw.fetchedAt);
  const event = await processAnnouncementWithLlm(db, raw, {}, async () => extraction);
  assert.equal(event.status, 'published');
  assert.equal(
    db.prepare('SELECT published_at FROM raw_announcements').get()?.published_at,
    '2026-09-30T00:00:00+08:00',
  );
  const row = db.prepare('SELECT topics, summary, is_event FROM events').get();
  assert.equal(row?.topics, '["it"]');
  assert.equal(row?.summary, extraction.summary);
  assert.equal(row?.is_event, 1);
});

test('學號推系所與入學學年：只認資工系學士班', () => {
  assert.deepEqual(profileFromStudentId('01357107'), { department: 'csie', admissionYear: 113 });
  assert.equal(profileFromStudentId('01358107'), null);
  assert.equal(profileFromStudentId('11357107'), null);
  assert.equal(profileFromStudentId(null), null);
});

test('學年度 8 月 1 日換年，年級最多算到 4', () => {
  assert.equal(currentAcademicYear(new Date('2026-07-31T15:00:00Z')), 114);
  assert.equal(currentAcademicYear(new Date('2026-07-31T16:00:00Z')), 115);
  const now = new Date('2026-11-24T00:00:00+08:00');
  assert.equal(gradeFromAdmissionYear(115, now), 1);
  assert.equal(gradeFromAdmissionYear(113, now), 3);
  assert.equal(gradeFromAdmissionYear(100, now), 4);
  assert.equal(gradeFromAdmissionYear(116, now), null);
  assert.equal(gradeFromAdmissionYear(null, now), null);
});

test('相關度：系所、主題與年級加權', () => {
  const base = {
    category: 'lecture' as const,
    topics: [],
    audiences: [],
    audienceDepartments: [],
    audienceGrades: [],
  };
  const freshman = { department: 'csie' as const, grade: 1, interests: [] };
  const senior = { department: 'csie' as const, grade: 4, interests: [] };
  assert.equal(relevanceScore(freshman, base), 0);
  assert.equal(relevanceScore(freshman, { ...base, topics: ['it'] }), 2);
  assert.equal(relevanceScore(freshman, { ...base, audienceDepartments: ['csie'] }), 3);
  assert.equal(relevanceScore(freshman, { ...base, category: 'camp' }), 1);
  assert.equal(relevanceScore(senior, { ...base, topics: ['career'] }), 1);
  assert.equal(relevanceScore(senior, { ...base, topics: ['it'], audienceGrades: [1] }), 0);
});
