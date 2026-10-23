export interface AppConfig {
  port: number;
  ebirdApiKey: string | undefined;
  ebirdBaseUrl: string;
  requestTimeoutMs: number;
  taxonomyTtlMs: number;
  countriesTtlMs: number;
  observationsTtlMs: number;
  recentBackDays: number;
  maxResults: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  corsOrigin: string | undefined;
  trustProxy: string | number;
  staticDir: string | undefined;
}

// Express "trust proxy": a hop count ("1") or a named subnet/list ("loopback").
function trustProxyFromEnv(value: string | undefined): string | number {
  const trimmed = value?.trim();
  if (!trimmed) return 'loopback';
  return /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : trimmed;
}

function intFromEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const key = env['EBIRD_API_KEY']?.trim();
  return {
    port: intFromEnv(env['PORT'], 3000, 1, 65535),
    // Treat the placeholder from .env.example as "not configured".
    ebirdApiKey: key && key !== 'your-ebird-api-key-here' ? key : undefined,
    ebirdBaseUrl: (env['EBIRD_BASE_URL'] ?? 'https://api.ebird.org/v2').replace(/\/+$/, ''),
    requestTimeoutMs: intFromEnv(env['EBIRD_TIMEOUT_MS'], 15_000, 1_000, 120_000),
    taxonomyTtlMs: intFromEnv(env['TAXONOMY_CACHE_HOURS'], 24, 1, 24 * 30) * 3_600_000,
    countriesTtlMs: 24 * 3_600_000,
    observationsTtlMs: intFromEnv(env['OBSERVATIONS_CACHE_SECONDS'], 120, 0, 3_600) * 1_000,
    // eBird "recent" endpoints accept back=1..30. The spec asks for 10 days.
    recentBackDays: intFromEnv(env['RECENT_BACK_DAYS'], 10, 1, 30),
    // eBird accepts maxResults=1..10000.
    maxResults: intFromEnv(env['EBIRD_MAX_RESULTS'], 5_000, 1, 10_000),
    rateLimitWindowMs: intFromEnv(env['RATE_LIMIT_WINDOW_SECONDS'], 60, 1, 3_600) * 1_000,
    rateLimitMax: intFromEnv(env['RATE_LIMIT_MAX'], 60, 1, 10_000),
    corsOrigin: env['CORS_ORIGIN']?.trim() || undefined,
    // Behind a hosting load balancer set TRUST_PROXY=1 so rate limiting sees real client IPs.
    trustProxy: trustProxyFromEnv(env['TRUST_PROXY']),
    // Folder with the built Angular app. When set, the server also serves the website.
    staticDir: env['STATIC_DIR']?.trim() || undefined,
  };
}
