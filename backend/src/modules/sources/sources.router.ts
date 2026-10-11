import { Router, type Response } from 'express';
import { notImplemented } from '../../shared/notImplemented.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { createSource, listSources, listSourcesBySubmitter } from './sources.service.js';
import { isSourceType } from './sourceTypes.js';

// 活動資訊來源（Source）：審核狀態與啟用狀態分開管理
export const sourcesRouter = Router();

const NAME_MAX_LENGTH = 100;
const URL_MAX_LENGTH = 2048;

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

// 列出來源：管理員看到全部，其他人（含訪客）只看到已核准的來源
sourcesRouter.get('/', (req, res) => {
  const isAdmin = req.user?.role === 'admin';
  res.json({ sources: listSources({ approvedOnly: !isAdmin }) });
});

// TODO(#22): US-14 管理員審核來源（核准／退回）
sourcesRouter.post('/:sourceId/review', requireRole('admin'), notImplemented('#22'));

// TODO(#23): US-15 來源可信度／風險提示
sourcesRouter.get('/:sourceId/risk', notImplemented('#23'));

// TODO(#24): US-16 管理員啟用／停用來源
sourcesRouter.patch('/:sourceId/enabled', requireRole('admin'), notImplemented('#24'));
