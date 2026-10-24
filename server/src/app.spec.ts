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

  it('queries the day\'s checklist locations so a species seen at several locations is listed at each', async () => {
    const falcon = (locId: string, locName: string, obsDt: string) =>
      ({ speciesCode: 'reffal1', comName: 'Red-footed Falcon', sciName: 'Falco vespertinus', locId, locName, obsDt, lat: 32, lng: 35, subId: `S-${locId}` });
    const locs = Array.from({ length: 60 }, (_, i) => `L${i + 1}`);
    const { app, fetchMock } = setup((url) => {
      if (url.pathname.startsWith('/v2/product/lists/')) return json([...locs, 'L1'].map((locId) => ({ locId })));
      const r = url.searchParams.get('r');
      // Like eBird: region-wide gives one record per species, r= gives one per species per location.
      if (!r) return json([falcon('L1', 'Hulda', '2026-10-21 08:16')]);
      return json(r.split(',').filter((id) => id === 'L1' || id === 'L55').map((id) => falcon(id, id === 'L1' ? 'Hulda' : 'Arsuf', '2026-10-21 06:32')));
    });

    const res = await request(app).get('/api/observations/historic/IL/2026/10/21?species=reffal1');

    expect(res.status).toBe(200);
    expect(res.body.observations.map((o: { locationName: string }) => o.locationName).sort()).toEqual(['Arsuf', 'Hulda']);
    const batches = fetchMock.mock.calls
      .map(([u]) => new URL(String(u)).searchParams.get('r'))
      .filter((r): r is string => r !== null)
      .map((r) => r.split(',').length);
    expect(batches.sort((a, b) => a - b)).toEqual([10, 50]);
    expect(res.body.meta.coverage).not.toContain('may be missing');
  });

  it('still answers from the region-wide result when the checklist feed fails', async () => {
    const { app } = setup((url) =>
      url.pathname.startsWith('/v2/product/lists/') ? json({}, 500) : json(historicDay),
    );
    const res = await request(app).get('/api/observations/historic/IL/2025/11/15?species=houspa');
    expect(res.status).toBe(200);
    expect(res.body.observations).toHaveLength(2);
  });

  it('warns when the checklist feed hits its 200 limit', async () => {
    const { app } = setup((url) =>
      url.pathname.startsWith('/v2/product/lists/')
        ? json(Array.from({ length: 200 }, (_, i) => ({ locId: `L${i}` })))
        : json(historicDay),
    );
    const res = await request(app).get('/api/observations/historic/US/2025/11/15');
    expect(res.body.meta.coverage).toContain('some locations may be missing');
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

  it('caches taxonomy, normalizes it and adds Hebrew names', async () => {
    const { app, fetchMock } = setup((url) =>
      url.searchParams.get('locale') === 'he'
        ? json([
            { speciesCode: 'houspa', comName: 'דרור הבית', sciName: 'Passer domesticus' },
            // eBird falls back to English when it has no Hebrew name
            { speciesCode: 'ostric2', comName: 'Common Ostrich', sciName: 'Struthio camelus' },
          ])
        : json([
            { speciesCode: 'houspa', comName: 'House Sparrow', sciName: 'Passer domesticus', category: 'species', taxonOrder: 2 },
            { speciesCode: 'ostric2', comName: 'Common Ostrich', sciName: 'Struthio camelus', category: 'species', taxonOrder: 1 },
          ]),
    );
    const first = await request(app).get('/api/taxonomy').expect(200);
    await request(app).get('/api/taxonomy').expect(200);
    expect(fetchMock).toHaveBeenCalledTimes(2); // English + Hebrew, then cached
    expect(first.body[0]).toMatchObject({ speciesCode: 'ostric2', commonName: 'Common Ostrich', scientificName: 'Struthio camelus', hebrewName: null });
    expect(first.body[1]).toMatchObject({ speciesCode: 'houspa', commonName: 'House Sparrow', hebrewName: 'דרור הבית' });
    const urls = fetchMock.mock.calls.map(([u]) => new URL(String(u)));
    expect(urls.every((u) => u.searchParams.get('fmt') === 'json' && u.searchParams.get('cat') === 'species')).toBe(true);
    expect(urls.map((u) => u.searchParams.get('locale')).sort()).toEqual(['en', 'he']);
  });

  it('lets browsers revalidate the taxonomy with a cheap 304 instead of caching it blindly', async () => {
    const { app } = setup(() => json([{ speciesCode: 'houspa', comName: 'House Sparrow', sciName: 'Passer domesticus' }]));
    const first = await request(app).get('/api/taxonomy').expect(200);
    expect(first.headers['cache-control']).toBe('no-cache');
    expect(first.headers['etag']).toBeTruthy();
    await request(app).get('/api/taxonomy').set('If-None-Match', first.headers['etag']!).expect(304);
  });

  it('adds Hebrew names to observations', async () => {
    const { app } = setup((url) =>
      url.pathname === '/v2/ref/taxonomy/ebird'
        ? json([{ speciesCode: 'houspa', comName: 'דרור הבית', sciName: 'Passer domesticus' }])
        : json(historicDay),
    );
    const res = await request(app).get('/api/observations/historic/IL/2025/11/15');
    const names = Object.fromEntries(res.body.observations.map((o: { speciesCode: string; hebrewName: string | null }) => [o.speciesCode, o.hebrewName]));
    expect(names).toEqual({ houspa: 'דרור הבית', comkin1: null });
  });

  it('still returns observations when the Hebrew taxonomy fails', async () => {
    const { app } = setup((url) => (url.pathname === '/v2/ref/taxonomy/ebird' ? json({}, 500) : json(historicDay)));
    const res = await request(app).get('/api/observations/recent/IL?species=houspa');
    expect(res.status).toBe(200);
    expect(res.body.observations[0].hebrewName).toBeNull();
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
    writeFileSync(join(dir, 'main-ABCD1234.js'), 'console.log(1);');
    writeFileSync(join(dir, 'ngsw-worker.js'), '/* sw */');
    const { app } = setup(() => json({}), { STATIC_DIR: dir });

    const index = await request(app).get('/');
    expect(index.status).toBe(200);
    expect(index.text).toContain('BirdScope');
    expect(index.headers['cache-control']).toBe('no-cache');

    const bundle = await request(app).get('/main-ABCD1234.js');
    expect(bundle.status).toBe(200);
    expect(bundle.headers['cache-control']).toContain('immutable');

    // The service worker must never be cached long, or installed apps would never update.
    const worker = await request(app).get('/ngsw-worker.js');
    expect(worker.headers['cache-control']).toBe('no-cache');

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
