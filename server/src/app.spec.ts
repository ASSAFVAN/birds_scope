import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import type { FetchLike } from './services/ebird-client.js';

const API_KEY = 'test-secret-key-123';
const NOW = () => new Date('2026-10-22T12:00:00Z');

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function setup(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>, env: Record<string, string> = {}) {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) =>
    handler(new URL(input instanceof Request ? input.url : input), init),
  );
  const config = loadConfig({ EBIRD_API_KEY: API_KEY, OBSERVATIONS_CACHE_SECONDS: '0', ...env });
  const app = createApp({ config, fetchImpl: fetchMock as unknown as FetchLike, now: NOW });
  return { app, fetchMock };
}

const historicDay = [
  { speciesCode: 'houspa', comName: 'House Sparrow', sciName: 'Passer domesticus', locId: 'L1', locName: 'Park', obsDt: '2025-11-15 08:10', howMany: 4, lat: 32.8, lng: 35.0, subId: 'S1' },
  { speciesCode: 'comkin1', comName: 'Common Kingfisher', sciName: 'Alcedo atthis', locId: 'L2', locName: 'River', obsDt: '2025-11-15', lat: 32.9, lng: 35.1, subId: 'S2' },
  { speciesCode: 'houspa', comName: 'House Sparrow', sciName: 'Passer domesticus', locId: 'L3', locName: 'Beach', obsDt: '2025-11-15 16:00', howMany: 2, lat: 32.7, lng: 34.9, subId: 'S3' },
];

describe('BirdScope API proxy', () => {
  it('sends the API key only in the X-eBirdApiToken header and never returns it', async () => {
    const { app, fetchMock } = setup(() => json(historicDay));
    const res = await request(app).get('/api/observations/historic/IL/2025/11/15?species=houspa');

    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).not.toContain(API_KEY);
    expect((init?.headers as Record<string, string>)['X-eBirdApiToken']).toBe(API_KEY);
    expect(JSON.stringify(res.body)).not.toContain(API_KEY);
    expect(JSON.stringify(res.headers)).not.toContain(API_KEY);
  });

  it('builds the historic URL with country, year, month and day and filters by species code', async () => {
    const { app, fetchMock } = setup(() => json(historicDay));
    const res = await request(app).get('/api/observations/historic/il/2025/11/15?species=houspa');

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.pathname).toBe('/v2/data/obs/IL/historic/2025/11/15');
    expect(url.searchParams.get('rank')).toBe('mrec');
    expect(res.body.observations).toHaveLength(2);
    expect(res.body.observations.every((o: { speciesCode: string }) => o.speciesCode === 'houspa')).toBe(true);
    expect(res.body.meta).toMatchObject({ endpoint: 'historic', regionCode: 'IL', date: '2025-11-15', upstreamCount: 3 });
  });

  it('keeps missing counts and times as null instead of inventing them', async () => {
    const { app } = setup(() => json(historicDay));
    const res = await request(app).get('/api/observations/historic/IL/2025/11/15?species=comkin1');
    expect(res.body.observations[0]).toMatchObject({ count: null, date: '2025-11-15', time: null });
  });

  it('uses the recent species endpoint with back=10', async () => {
    const { app, fetchMock } = setup(() => json([]));
    await request(app).get('/api/observations/recent/IL?species=houspa').expect(200);
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.pathname).toBe('/v2/data/obs/IL/recent/houspa');
    expect(url.searchParams.get('back')).toBe('10');
  });

  it('uses the all-species recent endpoint when no species is given', async () => {
    const { app, fetchMock } = setup(() => json([]));
    await request(app).get('/api/observations/recent/JP').expect(200);
    expect(new URL(String(fetchMock.mock.calls[0]![0])).pathname).toBe('/v2/data/obs/JP/recent');
  });

  it.each([
    ['/api/observations/recent/Israel', 'bad region'],
    ['/api/observations/recent/IL?species=House%20Sparrow', 'bad species'],
    ['/api/observations/historic/IL/2025/02/30', 'non-existent day'],
    ['/api/observations/historic/IL/2023/02/29', 'not a leap year'],
    ['/api/observations/historic/IL/2025/13/01', 'bad month'],
    ['/api/observations/historic/IL/2027/01/01', 'future date'],
  ])('rejects %s (%s) without calling eBird', async (path) => {
    const { app, fetchMock } = setup(() => json([]));
    const res = await request(app).get(path);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts 29 February in a leap year', async () => {
    const { app } = setup(() => json([]));
    await request(app).get('/api/observations/historic/IL/2024/02/29').expect(200);
  });

  it('caches taxonomy and normalizes it', async () => {
    const { app, fetchMock } = setup(() =>
      json([
        { speciesCode: 'houspa', comName: 'House Sparrow', sciName: 'Passer domesticus', category: 'species', taxonOrder: 2 },
        { speciesCode: 'ostric2', comName: 'Common Ostrich', sciName: 'Struthio camelus', category: 'species', taxonOrder: 1 },
      ]),
    );
    const first = await request(app).get('/api/taxonomy').expect(200);
    await request(app).get('/api/taxonomy').expect(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.body[0]).toMatchObject({ speciesCode: 'ostric2', commonName: 'Common Ostrich', scientificName: 'Struthio camelus' });
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.searchParams.get('fmt')).toBe('json');
    expect(url.searchParams.get('cat')).toBe('species');
  });

  it('reports a missing API key clearly', async () => {
    const { app, fetchMock } = setup(() => json([]), { EBIRD_API_KEY: '' });
    const res = await request(app).get('/api/observations/recent/IL');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('API_KEY_MISSING');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps upstream rate limiting to 429 RATE_LIMITED', async () => {
    const { app } = setup(() => json({}, 429, { 'retry-after': '30' }));
    const res = await request(app).get('/api/observations/recent/IL');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBe('30');
  });

  it('maps timeouts to 504 UPSTREAM_TIMEOUT', async () => {
    const { app } = setup(() => {
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    });
    const res = await request(app).get('/api/observations/recent/IL');
    expect(res.status).toBe(504);
    expect(res.body.error.code).toBe('UPSTREAM_TIMEOUT');
  });

  it('maps network failures to 502 without leaking details', async () => {
    const { app } = setup(() => {
      throw new TypeError('getaddrinfo ENOTFOUND api.ebird.org secret-internal-detail');
    });
    const res = await request(app).get('/api/observations/recent/IL');
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('UPSTREAM_UNREACHABLE');
    expect(JSON.stringify(res.body)).not.toContain('secret-internal-detail');
  });

  it('maps historic 404 to HISTORIC_UNAVAILABLE', async () => {
    const { app } = setup(() => json({}, 404));
    const res = await request(app).get('/api/observations/historic/IL/1850/01/01');
    expect(res.body.error.code).toBe('HISTORIC_UNAVAILABLE');
  });

  it('applies its own per-client rate limit', async () => {
    const { app } = setup(() => json([]), { RATE_LIMIT_MAX: '2' });
    await request(app).get('/api/health').expect(200);
    await request(app).get('/api/health').expect(200);
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('serves the web app and falls back to index.html when STATIC_DIR is set', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'birdscope-web-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>BirdScope</title>');
    writeFileSync(join(dir, 'main-ABC123.js'), 'console.log(1);');
    const { app } = setup(() => json({}), { STATIC_DIR: dir });

    const index = await request(app).get('/');
    expect(index.status).toBe(200);
    expect(index.text).toContain('BirdScope');
    expect(index.headers['cache-control']).toBe('no-cache');

    const bundle = await request(app).get('/main-ABC123.js');
    expect(bundle.status).toBe(200);
    expect(bundle.headers['cache-control']).toContain('immutable');

    const deepLink = await request(app).get('/some/page');
    expect(deepLink.status).toBe(200);
    expect(deepLink.text).toContain('BirdScope');

    const unknownApi = await request(app).get('/api/nope');
    expect(unknownApi.status).toBe(404);
    expect(unknownApi.body.error).toBeDefined();
  });

  it('does not serve a web app when STATIC_DIR is not set', async () => {
    const { app } = setup(() => json({}));
    const res = await request(app).get('/');
    expect(res.status).toBe(404);
  });

  it('rate limits per forwarded client IP when TRUST_PROXY is set', async () => {
    const { app } = setup(() => json({}), { TRUST_PROXY: '1', RATE_LIMIT_MAX: '1' });
    expect((await request(app).get('/api/health').set('X-Forwarded-For', '1.1.1.1')).status).toBe(200);
    expect((await request(app).get('/api/health').set('X-Forwarded-For', '2.2.2.2')).status).toBe(200);
    expect((await request(app).get('/api/health').set('X-Forwarded-For', '1.1.1.1')).status).toBe(429);
  });
});
