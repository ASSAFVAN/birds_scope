import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';

// Load ../.env (project root) or ./.env if present. Real environment variables win.
for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '..', '.env')]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

// Serve the Angular build (../../dist/birdscope/browser from server/src or server/dist) when it exists.
const builtWeb = resolve(import.meta.dirname, '..', '..', 'dist', 'birdscope', 'browser');
const config = loadConfig({
  ...process.env,
  STATIC_DIR: process.env['STATIC_DIR'] ?? (existsSync(builtWeb) ? builtWeb : undefined),
});
const app = createApp({ config });

app.listen(config.port, () => {
  console.log(`BirdScope API listening on http://localhost:${config.port}/api`);
  if (config.staticDir) console.log(`Serving web app from ${config.staticDir}`);
  if (!config.ebirdApiKey) {
    console.warn('EBIRD_API_KEY is not set. eBird requests will fail until you add it to .env.');
  }
});
