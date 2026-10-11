import type { RequestHandler } from 'express';

/**
 * 尚未實作的 API 入口，回傳 501 並標示負責的 issue。
 * 實作功能時，把 `notImplemented(...)` 換成真正的 handler。
 */
export function notImplemented(issue: string): RequestHandler {
  return (_req, res) => {
    res.status(501).json({
      error: 'not_implemented',
      issue,
      message: `This endpoint is tracked in ${issue}.`,
    });
  };
}
