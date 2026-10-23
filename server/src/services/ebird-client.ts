import { ApiError } from './api-error.js';

export type FetchLike = typeof fetch;

export interface EbirdClientOptions {
  apiKey: string | undefined;
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: FetchLike;
}

export type QueryValue = string | number | boolean | undefined;

/**
 * Low-level eBird API v2 client. Adds the X-eBirdApiToken header, enforces a
 * timeout and converts transport/HTTP failures into typed ApiErrors.
 * The API key never leaves this module.
 */
export class EbirdClient {
  private readonly fetchImpl: FetchLike;

  constructor(private readonly options: EbirdClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get isConfigured(): boolean {
    return Boolean(this.options.apiKey);
  }

  async get<T>(path: string, query: Record<string, QueryValue> = {}): Promise<T> {
    if (!this.options.apiKey) {
      throw new ApiError(
        503,
        'API_KEY_MISSING',
        'The server has no eBird API key configured. Set EBIRD_API_KEY in .env and restart the server.',
      );
    }

    const url = new URL(this.options.baseUrl + path);
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(name, String(value));
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { 'X-eBirdApiToken': this.options.apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (err) {
      const name = (err as { name?: string } | null)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new ApiError(504, 'UPSTREAM_TIMEOUT', 'eBird did not respond in time. Please try again.');
      }
      throw new ApiError(502, 'UPSTREAM_UNREACHABLE', 'Could not reach the eBird API. Check your network connection.');
    }

    if (!response.ok) {
      throw this.toApiError(response);
    }

    try {
      return (await response.json()) as T;
    } catch {
      throw new ApiError(502, 'UPSTREAM_ERROR', 'eBird returned a response that could not be read.');
    }
  }

  private toApiError(response: Response): ApiError {
    switch (response.status) {
      case 400:
        return new ApiError(400, 'INVALID_REQUEST', 'eBird rejected the request parameters.');
      case 401:
      case 403:
        return new ApiError(502, 'API_KEY_REJECTED', 'eBird rejected the configured API key. Check EBIRD_API_KEY.');
      case 404:
        return new ApiError(404, 'NOT_FOUND', 'eBird has no data for this request.');
      case 429: {
        const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
        return new ApiError(
          429,
          'RATE_LIMITED',
          'eBird is rate limiting requests. Please wait a moment and try again.',
          Number.isFinite(retryAfter) ? retryAfter : undefined,
        );
      }
      default:
        if (response.status === 503) {
          return new ApiError(503, 'UPSTREAM_ERROR', 'eBird is temporarily unavailable. Please try again later.');
        }
        return new ApiError(502, 'UPSTREAM_ERROR', `eBird returned an unexpected error (HTTP ${response.status}).`);
    }
  }
}
