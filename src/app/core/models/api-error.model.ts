import { HttpErrorResponse } from '@angular/common/http';

export type AppErrorCode =
  | 'API_KEY_MISSING'
  | 'API_KEY_REJECTED'
  | 'INVALID_REQUEST'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNREACHABLE'
  | 'UPSTREAM_ERROR'
  | 'HISTORIC_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'VALIDATION';

export interface AppError {
  code: AppErrorCode;
  message: string;
  /** Whether retrying the same request may help. */
  retryable: boolean;
}

const RETRYABLE: ReadonlySet<AppErrorCode> = new Set<AppErrorCode>([
  'RATE_LIMITED',
  'UPSTREAM_TIMEOUT',
  'UPSTREAM_UNREACHABLE',
  'UPSTREAM_ERROR',
  'INTERNAL_ERROR',
  'NETWORK_ERROR',
]);

export function appError(code: AppErrorCode, message: string): AppError {
  return { code, message, retryable: RETRYABLE.has(code) };
}

/** Converts anything thrown by HttpClient (or elsewhere) into a safe, user-facing AppError. */
export function isAppError(err: unknown): err is AppError {
  return (
    !!err &&
    typeof err === 'object' &&
    typeof (err as AppError).code === 'string' &&
    typeof (err as AppError).message === 'string' &&
    typeof (err as AppError).retryable === 'boolean'
  );
}

export function toAppError(err: unknown): AppError {
  if (isAppError(err)) return err;
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return appError('NETWORK_ERROR', 'Could not reach the BirdScope server. Is it running (npm run dev)?');
    }
    const body = err.error as { error?: { code?: string; message?: string } } | null;
    const code = body?.error?.code as AppErrorCode | undefined;
    if (code && body?.error?.message) return appError(code, body.error.message);
    if (err.status === 429) return appError('RATE_LIMITED', 'Too many requests. Please wait a moment and try again.');
    if (err.status === 504) return appError('UPSTREAM_TIMEOUT', 'The request timed out. Please try again.');
    // Typically the dev proxy answering because the API server isn't running.
    if (err.status === 502 || err.status === 503) {
      return appError('NETWORK_ERROR', 'The BirdScope API server is not reachable. Start it with npm run dev.');
    }
    return appError('INTERNAL_ERROR', `Unexpected server error (HTTP ${err.status}).`);
  }
  return appError('INTERNAL_ERROR', 'Something went wrong. Please try again.');
}
