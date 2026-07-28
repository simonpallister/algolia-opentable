# OpenTable Search Demo

Algolia Solutions Engineer take-home submission: a restaurant discovery
demo built for a fictional prospect scenario (OpenTable evaluating Algolia
to replace an aging Elasticsearch-based search experience). Two parts - a
one-time data pipeline that populates a live Algolia index, and a Next.js
front-end that searches it.

- **Live demo:** https://opentable.pallister.au
- **Support access:** enabled on the Algolia dashboard (Settings → Support
  Access) per the assignment's deliverables checklist.

## Approach

A high-level description of the approach taken can be found in [`APPROACH.md`](APPROACH.md)

## Setup

To run locally and/or execute scripts

```bash
npm install
cp .env.example .env   # fill in your Algolia app ID + API keys
```

`.env` needs two parities of the same values - see the comments in
`.env.example`:

- `ALGOLIA_APP_ID` / `ALGOLIA_SEARCH_API_KEY` / `ALGOLIA_ADMIN_API_KEY` /
  `ALGOLIA_INDEX_NAME` - used by the Node pipeline scripts.
- `NEXT_PUBLIC_ALGOLIA_APP_ID` / `NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY` /
  `NEXT_PUBLIC_ALGOLIA_INDEX_NAME` - browser-exposed mirrors for the
  front-end. **Search-only key only** - Next.js inlines any
  `NEXT_PUBLIC_*` var into the client bundle, so the admin key must never
  go here.

## Data pipeline (`scripts/`)

Plain ES-module Node scripts, run manually and in order - not part of the
Next.js build, not re-run on every request.

| Script                    | Run with                       | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prepare-data.js`         | `npm run prepare-data`         | Joins `data/source/restaurants_list.json` (5,000 records) with `restaurants_info.csv` on `objectID`, normalizes payment options to the four allowed card brands, derives `cuisine_category`, and writes `data/restaurants.json`. Also chains `build-area-centroids.js` at the end.                                                                                                                                                                                                     |
| `build-area-centroids.js` | `npm run build-area-centroids` | Reads `data/restaurants.json`, averages `_geoloc` per `area`, writes `data/area-centroids.json`. Lets browser geolocation resolve to the nearest `area` facet value. Runs automatically as part of `prepare-data`; also exposed standalone for re-running in isolation.                                                                                                                                                                                                                |
| `push-to-algolia.js`      | `npm run push-to-algolia`      | Reads `data/restaurants.json`, computes a Bayesian-adjusted `popularity_score` per record, drops the local-only `payment_options_raw` field, pushes all records to the index, then applies `searchableAttributes`, `attributesForFaceting`, `customRanking`, and cuisine synonyms. **Uses the admin key - writes to the live index.** Every setting it applies is already decided and reasoned about in `DECISIONS.md`; this script encodes those decisions, it doesn't make new ones. |
| `test-search-quality.js`  | `npm run test-search-quality`  | 26 assertions against the **live** index (search-only key, read-only): typo tolerance, chain disambiguation, concatenated-word queries, synonyms, empty/no-results handling. Currently 26/26. Re-run after any change to `push-to-algolia.js` or index settings.                                                                                                                                                                                                                       |

Typical order for a full rebuild from scratch:

```bash
npm run prepare-data
npm run push-to-algolia
npm run test-search-quality
```

There is no unit test runner in this repo - `test-search-quality.js` is
an integration suite against the real, already-configured index, not a
mock.

## Front-end

```bash
npm run dev          # http://localhost:3000
npm run build         # production build (also type-checks + lints)
npm run start          # serve the production build
npx tsc --noEmit        # type-check only, faster than a full build
```

Next.js 15 + React 19 + TypeScript, styled with Tailwind v4, search UI
hand-built on `react-instantsearch` v7 hooks (not the pre-built widget
components - see `CLAUDE.md` / `DECISIONS.md` for why), map via Leaflet +
`react-leaflet` + OpenStreetMap. Full component/architecture breakdown is
in `CLAUDE.md`.

## Deployment

`Dockerfile` (multi-stage, Next.js standalone output) + `docker-compose.yml`
build a production image; `.github/workflows/deploy.yml` runs `docker
compose build && docker compose up -d` on a self-hosted runner on every
push to `main`. The container binds to `127.0.0.1` only - a reverse proxy
in front of it terminates TLS and serves the public URL above. Only the
search-only public key is baked into the image at build time (see the
comments in `Dockerfile`); the admin key never leaves `.env` / GitHub
Actions secrets used by the data pipeline.

## Project structure

```
scripts/    data pipeline (plain JS) - see table above
data/       source files + generated restaurants.json / area-centroids.json
app/        Next.js app router entry (app/page.tsx renders SearchApp)
components/ front-end UI (SearchApp is the root; see CLAUDE.md)
lib/        Algolia client, geo fallback logic, formatting helpers
types/      Restaurant type, hand-kept in sync with the index record shape
assignment/ original brief, discovery notes etc
```
