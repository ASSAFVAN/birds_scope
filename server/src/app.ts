import compression from 'compression';
import express, { type Express } from 'express';
import { basename, join } from 'node:path';
import type { AppConfig } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createRateLimiter } from './middleware/rate-limit.js';
import { createEbirdRouter } from './routes/ebird.routes.js';
import { EbirdClient, type FetchLike } from './services/ebird-client.js';
import { EbirdService } from './services/ebird.service.js';

const HASHED_BUNDLE = /-[A-Z0-9]{8}\.(?:js|css)$/;

export interface AppDeps {
  config: AppConfig;
  fetchImpl?: FetchLike;
  now?: () => Date;
}

export function createApp({ config, fetchImpl, now }: AppDeps): Express {
  const client = new EbirdClient({
    apiKey: config.ebirdApiKey,
    baseUrl: config.ebirdBaseUrl,
    timeoutMs: config.requestTimeoutMs,
    fetchImpl,
  });
  const service = new EbirdService(client, config);

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(compression());

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (config.corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', config.corsOrigin);
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        res.status(204).end();
        return;
      }
    }
    next();
  });

  app.use('/api', createRateLimiter(config), createEbirdRouter(service, now), notFoundHandler);

  if (config.staticDir) {
    const indexHtml = join(config.staticDir, 'index.html');
    // Hashed bundles (main-ABCD1234.js) can be cached for a long time. Everything else — index.html,
    // the service worker (ngsw-worker.js, ngsw.json), manifest and icons — must revalidate so
    // installed apps pick up new builds.
    app.use(
      express.static(config.staticDir, {
        setHeaders: (res, path) => {
          res.setHeader(
            'Cache-Control',
            HASHED_BUNDLE.test(basename(path)) ? 'public, max-age=31536000, immutable' : 'no-cache',
          );
        },
      }),
    );
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
    });
  }

  app.use(errorHandler);
  return app;
}
