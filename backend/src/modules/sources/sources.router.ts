import { Router, type Response } from 'express';
import { notImplemented } from '../../shared/notImplemented.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import {
  createSource,
  listSources,
  listSourcesBySubmitter,
  listSourcesForAdmin,
  reviewSource,
  setSourceEnabled,
} from './sources.service.js';
import { REVIEW_STATUSES, isSourceType, type ReviewStatus } from './sourceTypes.js';

// 活動資訊來源（Source）：審核狀態與啟用狀態分開管理
export const sourcesRouter = Router();

const NAME_MAX_LENGTH = 100;
const URL_MAX_LENGTH = 2048;
const REVIEW_NOTE_MAX_LENGTH = 500;

type FieldErrors = Record<string, string>;

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function sendValidationError(res: Response, message: string, fields: FieldErrors): void {
  res.status(400).json({ error: 'validation_error', message, fields });
}

/** 只接受 http／https 網址，且不可內含帳號密碼。 */
function validateUrl(value: string): string | undefined {
  if (!value) return '請輸入來源網址';
  if (value.length > URL_MAX_LENGTH) return `來源網址不可超過 ${URL_MAX_LENGTH} 個字元`;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return '來源網址格式不正確';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return '來源網址必須以 http:// 或 https:// 開頭';
  }
  if (parsed.username || parsed.password) return '來源網址不可包含帳號或密碼';
  return undefined;
}

// US-13 提交新的活動資訊來源（需登入）；新來源一律為待審核，不會進入擷取流程
sourcesRouter.post('/', requireAuth, (req, res) => {
  const userId = req.user?.id;
  if (userId === undefined) {
    res.status(401).json({ error: 'unauthorized', message: '請先登入' });
    return;
  }

  const name = asString(req.body?.name).trim();
  const url = asString(req.body?.url).trim();
  const type = req.body?.type;

  const fields: FieldErrors = {};
  if (!name) {
    fields.name = '請輸入來源名稱';
  } else if (name.length > NAME_MAX_LENGTH) {
    fields.name = `來源名稱不可超過 ${NAME_MAX_LENGTH} 個字元`;
  }
  const urlError = validateUrl(url);
  if (urlError) fields.url = urlError;
  if (!isSourceType(type)) fields.type = '請選擇來源類型';

  if (Object.keys(fields).length > 0 || !isSourceType(type)) {
    sendValidationError(res, '來源資料有誤', fields);
    return;
  }

  const source = createSource({ name, url, type, submittedBy: userId });
  res.status(201).json({ source });
});

// US-13 使用者查看自己提交的來源與目前的審核狀態（需登入）
sourcesRouter.get('/mine', requireAuth, (req, res) => {
  const userId = req.user?.id;
  if (userId === undefined) {
    res.status(401).json({ error: 'unauthorized', message: '請先登入' });
    return;
  }
  res.json({ sources: listSourcesBySubmitter(userId) });
});

// 列出來源：管理員看到全部（含提交者與審核結果，可用 ?status= 篩選審核狀態），其他人（含訪客）只看到已核准的來源
sourcesRouter.get('/', (req, res) => {
  if (req.user?.role !== 'admin') {
    res.json({ sources: listSources({ approvedOnly: true }) });
    return;
  }

  const status = req.query.status;
  if (status !== undefined && !REVIEW_STATUSES.includes(status as ReviewStatus)) {
    sendValidationError(res, '審核狀態篩選條件有誤', {
      status: '請使用 pending、approved 或 rejected',
    });
    return;
  }
  res.json({ sources: listSourcesForAdmin({ reviewStatus: status as ReviewStatus | undefined }) });
});

// US-14 管理員審核來源（核准／退回），只有待審核的來源能審核；
// 核准前須確認來源為海大單位或社團（ntouVerified）；審核結果會保存，且不影響啟用狀態（US-16）
sourcesRouter.post('/:sourceId/review', requireRole('admin'), (req, res) => {
  const reviewerId = req.user?.id;
  if (reviewerId === undefined) {
    res.status(401).json({ error: 'unauthorized', message: '請先登入' });
    return;
  }

  const sourceId = Number(req.params.sourceId);
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    res.status(404).json({ error: 'not_found', message: '找不到這個來源' });
    return;
  }

  const decision = req.body?.decision;
  const ntouVerified = req.body?.ntouVerified;
  const note = asString(req.body?.note).trim();

  const fields: FieldErrors = {};
  if (decision !== 'approved' && decision !== 'rejected') {
    fields.decision = '請選擇核准或退回';
  }
  if (ntouVerified !== undefined && typeof ntouVerified !== 'boolean') {
    fields.ntouVerified = '格式不正確';
  } else if (decision === 'approved' && ntouVerified !== true) {
    fields.ntouVerified = '核准前請確認此來源為海大單位或社團';
  }
  if (note.length > REVIEW_NOTE_MAX_LENGTH) {
    fields.note = `審核備註不可超過 ${REVIEW_NOTE_MAX_LENGTH} 個字元`;
  }
  if (Object.keys(fields).length > 0 || (decision !== 'approved' && decision !== 'rejected')) {
    sendValidationError(res, '審核資料有誤', fields);
    return;
  }

  const result = reviewSource({
    sourceId,
    reviewerId,
    decision,
    ntouVerified: ntouVerified === true,
    note: note || null,
  });
  if (result === 'not_found') {
    res.status(404).json({ error: 'not_found', message: '找不到這個來源' });
  } else if (result === 'already_reviewed') {
    res.status(409).json({ error: 'already_reviewed', message: '這個來源已經審核過了' });
  } else {
    res.json({ source: result });
  }
});

// TODO(#23): US-15 來源可信度／風險提示
sourcesRouter.get('/:sourceId/risk', notImplemented('#23'));

// US-16 管理員啟用／停用來源：只有已核准的來源能切換，不影響審核狀態；
// 停用的來源不會進入擷取流程（見 listIngestableSources）
sourcesRouter.patch('/:sourceId/enabled', requireRole('admin'), (req, res) => {
  const sourceId = Number(req.params.sourceId);
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    res.status(404).json({ error: 'not_found', message: '找不到這個來源' });
    return;
  }

  const enabled = req.body?.enabled;
  if (typeof enabled !== 'boolean') {
    sendValidationError(res, '啟用狀態有誤', { enabled: '請指定啟用或停用' });
    return;
  }

  const result = setSourceEnabled(sourceId, enabled);
  if (result === 'not_found') {
    res.status(404).json({ error: 'not_found', message: '找不到這個來源' });
  } else if (result === 'not_approved') {
    res.status(409).json({ error: 'not_approved', message: '只有已核准的來源可以啟用或停用' });
  } else {
    res.json({ source: result });
  }
});
