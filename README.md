# BirdScope

Search, explore and map bird observations from the [eBird API v2](https://documenter.getpostman.com/view/664302/S1ENwy59).

- **Recent Observations**: the latest sightings of a species (or all species) in a country over the last 10 days.
- **Observation History**: sightings of one species in one country on **one specific date**.
- Results appear on a **Leaflet map** (clustered pins, popups) and in a **sortable, paginated table**. Selecting a row highlights its pin and selecting a pin highlights its row.
- Species autocomplete works with **English, Hebrew or scientific names** and always resolves to the canonical eBird species code. Hebrew names come from eBird's own Hebrew taxonomy (not a translation) and are shown in the suggestions, table and map popups.
- Map popups have **Waze** and **Google Maps** buttons that navigate to the sighting.
- **Installable (PWA)**: add it to your phone's home screen. The app shell works offline, the species list is cached for a day, and recent search results are served from cache when the network is slow (10 s) or gone. A "Reload" prompt appears when a new version is deployed.
- The 10 most recent distinct searches are kept in `localStorage`. Click one to rerun it.

Stack: Angular 21 (standalone, zoneless, Signals), Angular Material 3, Leaflet + Leaflet.markercluster, and a Node/Express proxy that keeps the eBird API key server-side.

---

## 1. Prerequisites

- **Node.js 20.19+, 22.12+ or 24+** (required by Angular 21). Check with `node -v`.
- **An eBird API key** (free): sign in at eBird, then request one at <https://ebird.org/api/keygen>.
- **VS Code** (recommended extensions are suggested automatically when you open the folder).

## 2. Setup

```bash
cd birdscope
npm install            # Angular app dependencies
npm run setup          # server/ dependencies (same as: cd server && npm install)
cp .env.example .env   # Windows: copy .env.example .env
```

Open `.env` and replace `your-ebird-api-key-here` with your key:

```
EBIRD_API_KEY=abcd1234efgh
```

## 3. Run

```bash
npm run dev
```

This starts both processes:

| Process | URL | What it does |
|---|---|---|
| `api` (Express) | <http://localhost:3000/api> | eBird proxy: adds the API key, validates input, caches, rate-limits |
| `web` (Angular) | <http://localhost:4200> | The app. `/api/*` is proxied to port 3000 (`proxy.conf.json`) |

Open <http://localhost:4200>.

### In VS Code

- **Terminal → Run Build Task…** (Ctrl/Cmd+Shift+B) runs `BirdScope: dev (API + web)`.
- **Run and Debug → "BirdScope: open in Chrome"** (F5) starts both processes and opens a debuggable Chrome window.
- **"BirdScope: debug API server"** runs only the Express server with breakpoints.
- **Terminal → Run Task → BirdScope: test** runs all tests.

### Other scripts

| Command | Purpose |
|---|---|
| `npm test` | Angular unit tests (Vitest + jsdom), then server tests (Vitest + Supertest) |
| `npm run test:web` | Angular tests in watch mode |
| `npm run test:server` | Server tests only |
| `npm run build` | Production build of web (`dist/birdscope`) and server (`server/dist`), then `check:secrets` |
| `npm start` | Run the built server (`server/dist`) |
| `npm run check:secrets` | Fails if the web build contains the API key, `X-eBirdApiToken`, `EBIRD_API_KEY` or `api.ebird.org` |

All tests use mocked responses. They never call eBird.

## 4. Backend API (Express proxy)

All responses are JSON. Errors always have the shape `{ "error": { "code": "...", "message": "..." } }`.

| Endpoint | eBird endpoint used | Notes |
|---|---|---|
| `GET /api/health` | – | `{ status, apiKeyConfigured }` |
| `GET /api/taxonomy` | `GET /v2/ref/taxonomy/ebird?fmt=json&cat=species&locale=en` and `locale=he` | Species-level entries only, normalized and sorted by taxonomic order, with `hebrewName` where eBird has one. Cached 24 h in memory. Observation responses get `hebrewName` from the same cache. |
| `GET /api/countries` | `GET /v2/ref/region/list/country/world` | Valid eBird country codes. Cached 24 h. |
| `GET /api/observations/recent/:region?species=code` | `GET /v2/data/obs/{region}/recent/{species}` or `/recent` when `species` is omitted | `back=10`, `maxResults=5000` (configurable). |
| `GET /api/observations/historic/:region/:yyyy/:mm/:dd?species=code` | `GET /v2/product/lists/{region}/{y}/{m}/{d}`, then `GET /v2/data/obs/{region}/historic/{y}/{m}/{d}` region-wide and with `r=` (50 locations per call) | `rank=mrec`, `detail=simple`, `maxResults=10000`. Merged per species and location, filtered by species code on the server, and again in the client. |

Observation responses look like this:

```jsonc
{
  "observations": [{
    "id": "houspa|S123|2025-11-15 08:10#0",
    "speciesCode": "houspa", "commonName": "House Sparrow", "scientificName": "Passer domesticus",
    "locationId": "L123", "locationName": "Haifa Bay",
    "count": 4,                // null = reported as present without a count ("X")
    "date": "2025-11-15", "time": "08:10",   // time is null when not reported
    "latitude": 32.8, "longitude": 35.05,
    "checklistId": "S123", "valid": true, "reviewed": false, "locationPrivate": false
  }],
  "meta": { "endpoint": "historic", "regionCode": "IL", "speciesCode": "houspa", "date": "2025-11-15",
            "upstreamCount": 412, "truncated": false, "maxResults": 10000, "coverage": "..." }
}
```

Validation and error codes:

- Region codes must look like `IL`, `US-NY` or `US-NY-109`. Species codes must be 3–12 lowercase letters/digits. Historic dates must exist (leap years included), fall in 1800 or later, and not be in the future.
- `API_KEY_MISSING` (503), `API_KEY_REJECTED` (502), `INVALID_REQUEST` (400), `RATE_LIMITED` (429, with `Retry-After` when eBird sends one), `UPSTREAM_TIMEOUT` (504), `UPSTREAM_UNREACHABLE` (502), `UPSTREAM_ERROR` (502/503), `HISTORIC_UNAVAILABLE`, `NOT_FOUND`, `INTERNAL_ERROR`.
- Stack traces and upstream details are logged on the server only. They are never sent to the browser.

**Security:** the key lives only in `.env` (git-ignored) and is read by the server, which sends it in the `X-eBirdApiToken` header. The Angular app only talks to `/api`. The proxy applies its own per-client rate limit (60 requests/min by default) to protect your eBird quota.

## 5. eBird API limitations (and what BirdScope shows)

| Limitation | How BirdScope handles it | Practical alternative |
|---|---|---|
| **Recent observations are not every sighting.** eBird returns the *most recent observation of each species at each location* within `back` days (1–30). | A coverage note under the results states this. `back` is 10, as specified. | For full checklists, use eBird's checklist endpoints (`/product/lists`, `/product/checklist/view`) per location. |
| **Historic endpoint, region-wide = one record per species for the whole region** for that date (`rank=mrec` gives the latest; `rank=create` gives the first submitted). With `r=` (up to 50 location ids) it gives one record per species per location. It has **no species filter**. | The day's locations come from the checklist feed (max 200 checklists per request), then the historic endpoint is queried per 50 locations and merged with the region-wide result, then filtered by `speciesCode`. About 3–6 eBird calls per new date; other species on the same date reuse a 2-minute server cache. | If a region had more than 200 checklists that day, some locations may be missing (the coverage note says so). Pick a smaller region. |
| **Historic searches cover a single date only.** There is no range parameter. | v1 deliberately supports one date. All historic logic sits in `HistoricalObservationService`, so a range feature can be added there later. | For ranges or bulk analysis, use the [eBird Basic Dataset (EBD)](https://ebird.org/data/download), the official bulk download with every observation, or loop over dates within your quota. |
| **Result caps:** `maxResults` is at most 10,000. | `meta.truncated` is set when the cap is hit, and the UI warns that results may be incomplete. | Narrow the region (e.g. `US-NY` instead of `US`). |
| **Counts may be missing** ("X" = present, not counted). Times may be missing. | Shown as "X" / "Present (not counted)" and a date without time. Nothing is invented. Sorting places uncounted entries below counted ones. | – |
| **Sensitive species and private locations** are withheld or obscured by eBird. | Mentioned in the coverage note. | – |
| **Rate limits are not formally published.** | Upstream 429 is surfaced as "Too many requests". The proxy has its own limiter, and taxonomy/countries/observations are cached. | Raise cache times in `.env`. |
| **Coordinates** are sometimes missing or unusable. | Invalid, out-of-range or `0,0` coordinates are not pinned. The map and results bar say how many were skipped. These rows still appear in the table. | – |

## 6. Project structure

```
birdscope/
├─ src/app/
│  ├─ core/
│  │  ├─ models/        bird-species, observation, bird-search, api-error
│  │  ├─ services/      ebird-api (HttpClient → Promise), species (taxonomy cache + local filtering),
│  │  │                 country, recent-search (localStorage, SSR-safe), historical-observation
│  │  ├─ state/         observation-search.store.ts (Signals store, one instance per section)
│  │  └─ utils/         date validation, species search, clock token
│  ├─ shared/           bird-autocomplete, country-select, date-picker, observations-table, recent-searches
│  ├─ features/         recent-observations, observation-history, observation-results
│  ├─ map/              observation-map component, leaflet-map.service.ts, map-markers.utils.ts, leaflet.token.ts
│  └─ app.ts / app.html (toolbar, theme toggle, tabs)
├─ src/testing/         fixtures and a fake Leaflet for unit tests
├─ server/src/
│  ├─ config/env.ts     environment parsing with safe bounds
│  ├─ services/         ebird-client (key, timeout, error mapping), ebird.service (endpoints + caching),
│  │                    normalize, validation, ttl-cache, api-error
│  ├─ middleware/       error handler, rate limiter
│  ├─ routes/           /api routes
│  ├─ app.ts            createApp() (injectable fetch for tests)
│  └─ server.ts         entry point (loads .env)
├─ scripts/check-no-api-key.mjs
└─ .vscode/             tasks, launch configs, recommended extensions
```

### Design notes

- **Signals first.** `ObservationSearchStore` holds criteria, results, selection, loading and error state as signals. Derived state (validation, counts, selected observation) uses `computed`. `effect` is used only for real side effects: syncing Leaflet markers, the Material table data source, the snackbar and the theme class. RxJS appears only where Angular APIs produce Observables (`HttpClient` via `firstValueFrom`, `BreakpointObserver` via `toSignal`).
- **Stale requests.** Each search gets an incrementing request id. A response that arrives after a newer search started is discarded, whether it succeeded or failed.
- **Leaflet isolation.** The map component owns the container and lifecycle. `LeafletMapService` (one per map) does all Leaflet work. Leaflet is loaded as a global script because markercluster patches the global `L`, and it is injected through the `LEAFLET` token so tests can use a fake. The map is created once. Only the cluster layer is rebuilt when results change. Hidden maps are re-measured (`invalidateSize`) when shown, and a fit requested while hidden is applied then.
- **Safe popups.** Popup content is built with DOM nodes and `textContent`. API strings are never inserted as HTML.
- **Mobile first.** Below 1100 px a Map/Table toggle shows one view at a time. Wider screens show both side by side. The table drops secondary columns below 720 px.
- **Themes.** Material 3 light/dark via `color-scheme`. The toolbar button cycles System → Light → Dark.

## 7. Tests vs acceptance criteria

| # | Criterion | Test |
|---|---|---|
| 1 | Common and scientific names select the same code | `core/services/species.service.spec.ts` |
| 2 | Taxonomy cached, filtered locally | `species.service.spec.ts`, `server/src/app.spec.ts` |
| 3 | Recent searches save / dedupe / restore / clear | `recent-search.service.spec.ts`, `observation-search.store.spec.ts` |
| 4 | Invalid and future dates rejected | `core/utils/date.utils.spec.ts`, `observation-search.store.spec.ts`, `app.spec.ts` |
| 5 | Historic request has country, year, month, day | `historical-observation.service.spec.ts`, `app.spec.ts` |
| 6 | Filtering uses the canonical species code | `historical-observation.service.spec.ts`, `app.spec.ts` |
| 7 | API failures update loading/error signals | `observation-search.store.spec.ts` |
| 8 | Stale requests can't overwrite newer results | `observation-search.store.spec.ts` |
| 9 | Invalid coordinates create no markers | `map/map-markers.utils.spec.ts`, `map/leaflet-map.service.spec.ts` |
| 10 | Marker ↔ table selection sync | `leaflet-map.service.spec.ts`, `observation-map.component.spec.ts`, `observations-table.component.spec.ts` |
| 11 | Map resizes after switching views | `observation-map.component.spec.ts`, `leaflet-map.service.spec.ts` |
| 12 | Sorting and pagination | `observations-table.component.spec.ts` |
| 13 | API key not exposed | `app.spec.ts` (header-only, never in responses) + `npm run check:secrets` on the build |

## 8. Deploy

In production the site and the API share one URL, so no CORS setup is needed. On a plain Node host the Express server serves the built Angular app (`dist/birdscope/browser`) itself.

**Vercel (config included):** the Angular build is served as static files and the Express API runs as one serverless function (`api/index.mjs`), configured by `vercel.json`.

1. Push this repo to GitHub.
2. In Vercel, choose **Add New > Project** and import the repo. Leave the build settings as they are; `vercel.json` sets them.
3. Under **Environment Variables** add `EBIRD_API_KEY` (your key) and `TRUST_PROXY` = `1`, then deploy.

Caches and the rate limiter live in memory, so on Vercel they are per function instance rather than global.

**Any other Node host** (Railway, Fly.io, a VPS):

- Build: `npm ci && npm ci --prefix server && npm run build`
- Start: `npm start`
- Env vars: `EBIRD_API_KEY`, and `TRUST_PROXY=1` when behind a load balancer. The host usually sets `PORT`.

## 9. Troubleshooting

- **"eBird API key missing"**: create `.env` from `.env.example`, set `EBIRD_API_KEY`, then restart `npm run dev`.
- **"Server not reachable"**: the Express process isn't running or port 3000 is taken. Change `PORT` in `.env` and the `target` in `proxy.conf.json` together.
- **"eBird API key rejected"**: the key is wrong or revoked. Generate a new one at <https://ebird.org/api/keygen>.
- **Map is blank grey**: OpenStreetMap tiles need internet access. Check the browser console for blocked tile requests.
- **Node version errors on install**: upgrade to Node 22 LTS (or 20.19+).
- **`npm error Cannot read properties of null (reading 'edgesOut')`**: an npm 10 bug when resolving this dependency tree without a lockfile. Upgrade npm (`npm install -g npm@11`) or run `npx npm@11 install`.

Bird data © eBird / Cornell Lab of Ornithology, used under the [eBird API Terms of Use](https://www.birds.cornell.edu/home/ebird-api-terms-of-use/). Map data © OpenStreetMap contributors.
