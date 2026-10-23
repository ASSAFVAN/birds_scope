import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ApiError, isApiError } from '../services/api-error.js';

/** 404 for unknown /api routes. */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new ApiError(404, 'NOT_FOUND', 'Unknown API endpoint.'));
};

/**
 * Converts every error into `{ error: { code, message } }`.
 * Stack traces and upstream details are logged server-side only.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (isApiError(err)) {
    if (err.retryAfterSeconds !== undefined) res.setHeader('Retry-After', String(err.retryAfterSeconds));
    if (err.status >= 500) console.warn(`[api] ${err.code}: ${err.message}`);
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  // Malformed JSON bodies etc. from Express itself.
  const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : 500;
  if (status >= 400 && status < 500) {
    res.status(status).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid request.' } });
    return;
  }
  console.error('[api] Unhandled error', err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on the server.' } });
};
