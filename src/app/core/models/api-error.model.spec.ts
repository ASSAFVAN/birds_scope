import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it } from 'vitest';
import { appError, toAppError } from './api-error.model';

describe('toAppError', () => {
  it('uses the server error code and message', () => {
    const err = new HttpErrorResponse({
      status: 503,
      error: { error: { code: 'API_KEY_MISSING', message: 'Set EBIRD_API_KEY' } },
    });
    expect(toAppError(err)).toEqual({ code: 'API_KEY_MISSING', message: 'Set EBIRD_API_KEY', retryable: false });
  });

  it('treats status 0 as the server being unreachable', () => {
    expect(toAppError(new HttpErrorResponse({ status: 0 })).code).toBe('NETWORK_ERROR');
  });

  it('falls back for 429 without a body', () => {
    expect(toAppError(new HttpErrorResponse({ status: 429 }))).toMatchObject({ code: 'RATE_LIMITED', retryable: true });
  });

  it('passes AppErrors through and hides unknown errors', () => {
    const e = appError('VALIDATION', 'Bad date');
    expect(toAppError(e)).toBe(e);
    expect(toAppError(new Error('stack trace with secrets')).message).not.toContain('secrets');
  });
});
