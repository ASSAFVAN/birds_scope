import { rateLimit } from 'express-rate-limit';
import type { AppConfig } from '../config/env.js';

/** Per-client request limit for the proxy, protecting the shared eBird quota. */
export function createRateLimiter(config: AppConfig) {
  return rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res, _next, options) => {
      res.status(options.statusCode).json({
        error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' },
      });
    },
  });
}
