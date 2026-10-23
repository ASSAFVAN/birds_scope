// Vercel serverless entry: runs the Express API (built to server/dist by `npm run build`).
// vercel.json rewrites /api/* here; req.url keeps the original path, so the /api routes match.
import { createApp } from '../server/dist/app.js';
import { loadConfig } from '../server/dist/config/env.js';

export default createApp({ config: loadConfig() });
