import type { AppConfig } from '../config/env.js';
import { ApiError, isApiError } from './api-error.js';
import type { EbirdClient } from './ebird-client.js';
import {
  type BirdSpecies,
  type Country,
  type Observation,
  normalizeCountry,
  normalizeObservations,
  normalizeTaxon,
  type RawRegion,
  type RawTaxon,
} from './normalize.js';
import { TtlCache } from './ttl-cache.js';
import type { HistoricDate } from './validation.js';

export interface ObservationMeta {
  endpoint: 'recent' | 'historic';
  regionCode: string;
  speciesCode: string | null;
  backDays: number | null;
  date: string | null;
  /** Number of records eBird returned before any species filtering. */
  upstreamCount: number;
  /** True when eBird returned exactly maxResults records, i.e. results may be cut off. */
  truncated: boolean;
  maxResults: number;
  coverage: string;
}

export interface ObservationsResponse {
  observations: Observation[];
  meta: ObservationMeta;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** eBird's cap on the checklist feed (maxResults=1..200). */
const CHECKLIST_FEED_MAX = 200;
/** eBird accepts up to 50 location ids in the historic endpoint's r parameter. */
const HISTORIC_MAX_LOCATIONS = 50;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function checklistLocationIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = new Set<string>();
  for (const c of raw) {
    const locId = (c as { locId?: unknown })?.locId;
    if (typeof locId === 'string' && locId) ids.add(locId);
  }
  return [...ids];
}

/** The region-wide record repeats one of the per-location records; keep the first of each species+location. */
function dedupeBySpeciesAndLocation(raw: unknown[]): unknown[] {
  const seen = new Set<string>();
  return raw.filter((r) => {
    const o = r as { speciesCode?: unknown; locId?: unknown };
    if (typeof o?.speciesCode !== 'string' || typeof o.locId !== 'string') return true;
    const k = `${o.speciesCode}|${o.locId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * eBird data access: taxonomy, countries, recent and historic observations.
 * Taxonomy and country lists are cached for hours; observation results for a
 * short time so repeated clicks don't spend API quota.
 */
export class EbirdService {
  private readonly taxonomyCache = new TtlCache<BirdSpecies[]>(2);
  private readonly countryCache = new TtlCache<Country[]>(2);
  private readonly observationCache = new TtlCache<ObservationsResponse>(200);

  constructor(
    private readonly client: EbirdClient,
    private readonly config: AppConfig,
  ) {}

  get apiKeyConfigured(): boolean {
    return this.client.isConfigured;
  }

  /** Species-level taxonomy (cat=species), sorted in taxonomic order. */
  getTaxonomy(): Promise<BirdSpecies[]> {
    return this.taxonomyCache.getOrLoad('species', this.config.taxonomyTtlMs, async () => {
      const raw = await this.client.get<RawTaxon[]>('/ref/taxonomy/ebird', {
        fmt: 'json',
        cat: 'species',
        locale: 'en',
      });
      if (!Array.isArray(raw)) throw new ApiError(502, 'UPSTREAM_ERROR', 'Unexpected taxonomy response from eBird.');
      return raw
        .map(normalizeTaxon)
        .filter((t): t is BirdSpecies => t !== null)
        .sort((a, b) => (a.taxonOrder ?? Infinity) - (b.taxonOrder ?? Infinity));
    });
  }

  getCountries(): Promise<Country[]> {
    return this.countryCache.getOrLoad('world', this.config.countriesTtlMs, async () => {
      const raw = await this.client.get<RawRegion[]>('/ref/region/list/country/world', { fmt: 'json' });
      if (!Array.isArray(raw)) throw new ApiError(502, 'UPSTREAM_ERROR', 'Unexpected region response from eBird.');
      return raw
        .map(normalizeCountry)
        .filter((c): c is Country => c !== null)
        .sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  /**
   * GET /data/obs/{regionCode}/recent[/{speciesCode}]
   * eBird returns the most recent observation of each species at each
   * location within `back` days, not every individual sighting.
   */
  getRecent(regionCode: string, speciesCode: string | undefined): Promise<ObservationsResponse> {
    const back = this.config.recentBackDays;
    const maxResults = this.config.maxResults;
    const path = speciesCode
      ? `/data/obs/${regionCode}/recent/${speciesCode}`
      : `/data/obs/${regionCode}/recent`;
    const key = `recent:${regionCode}:${speciesCode ?? '*'}:${back}:${maxResults}`;

    return this.observationCache.getOrLoad(key, this.config.observationsTtlMs, async () => {
      const raw = await this.client.get<unknown>(path, { back, maxResults, sppLocale: 'en' });
      const observations = normalizeObservations(raw);
      const upstreamCount = Array.isArray(raw) ? raw.length : 0;
      return {
        observations,
        meta: {
          endpoint: 'recent',
          regionCode,
          speciesCode: speciesCode ?? null,
          backDays: back,
          date: null,
          upstreamCount,
          truncated: upstreamCount >= maxResults,
          maxResults,
          coverage:
            `Most recent observation of ${speciesCode ? 'this species' : 'each species'} at each location ` +
            `in the last ${back} days (eBird "recent observations"). Not every individual sighting is included. ` +
            `Sensitive species and private details are withheld by eBird.`,
        },
      };
    });
  }

  /**
   * GET /data/obs/{regionCode}/historic/{y}/{m}/{d}
   * For a whole region eBird returns only one record per species for the date
   * (rank=mrec picks the latest). Passing location ids (r=, max 50 per call)
   * gives one record per species per location instead, so the day's locations
   * are read from the checklist feed (GET /product/lists/{regionCode}/{y}/{m}/{d})
   * and queried in batches. The region-wide result is merged in for locations
   * the feed missed. The endpoint has no species filter, so filtering by
   * species code happens here.
   */
  async getHistoric(
    regionCode: string,
    date: HistoricDate,
    speciesCode: string | undefined,
  ): Promise<ObservationsResponse> {
    const maxResults = 10_000; // historic results are filtered afterwards, so ask for the documented maximum
    const ymd = `${date.year}/${pad(date.month)}/${pad(date.day)}`;
    const key = `historic:${regionCode}:${ymd}`;
    const path = `/data/obs/${regionCode}/historic/${ymd}`;
    const query = { rank: 'mrec', detail: 'simple', maxResults, sppLocale: 'en' };

    let full: ObservationsResponse;
    try {
      // Cache the unfiltered day so different species on the same date reuse the same requests.
      full = await this.observationCache.getOrLoad(key, this.config.observationsTtlMs, async () => {
        const [regionWide, checklists] = await Promise.all([
          this.client.get<unknown>(path, query),
          // Best effort: without the feed we still have the region-wide records.
          this.client
            .get<unknown>(`/product/lists/${regionCode}/${ymd}`, { maxResults: CHECKLIST_FEED_MAX })
            .catch(() => []),
        ]);
        const locIds = checklistLocationIds(checklists);
        const perLocation = await Promise.all(
          chunk(locIds, HISTORIC_MAX_LOCATIONS).map((ids) => this.client.get<unknown>(path, { ...query, r: ids.join(',') })),
        );

        const responses = [...perLocation, regionWide].map((r) => (Array.isArray(r) ? r : []));
        const raw = dedupeBySpeciesAndLocation(responses.flat());
        const feedCapped = Array.isArray(checklists) && checklists.length >= CHECKLIST_FEED_MAX;
        return {
          observations: normalizeObservations(raw),
          meta: {
            endpoint: 'historic',
            regionCode,
            speciesCode: null,
            backDays: null,
            date: `${date.year}-${pad(date.month)}-${pad(date.day)}`,
            upstreamCount: raw.length,
            truncated: responses.some((r) => r.length >= maxResults),
            maxResults,
            coverage:
              'One record per species per location for this date (the latest observation, eBird rank=mrec). ' +
              'Repeat sightings at the same location are not listed. ' +
              (feedCapped
                ? `This region had more than ${CHECKLIST_FEED_MAX} checklists that day, so some locations may be missing; ` +
                  'pick a smaller region for complete results. '
                : '') +
              'Sensitive species are withheld by eBird.',
          },
        };
      });
    } catch (err) {
      if (isApiError(err) && (err.code === 'NOT_FOUND' || err.code === 'INVALID_REQUEST')) {
        throw new ApiError(err.status, 'HISTORIC_UNAVAILABLE', 'eBird has no historic data available for this region and date.');
      }
      throw err;
    }

    if (!speciesCode) return full;
    return {
      observations: full.observations.filter((o) => o.speciesCode === speciesCode),
      meta: { ...full.meta, speciesCode },
    };
  }
}
