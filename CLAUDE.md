# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An Algolia Solutions Engineer take-home: a restaurant discovery demo for a
fictional prospect scenario (OpenTable, a restaurant reservation platform,
evaluating Algolia to replace an aging Elasticsearch-based search
experience). Two parts: a one-time **data pipeline** (plain Node/JS
scripts) that populates a live Algolia index, and a **Next.js front-end**
(TypeScript) that searches it.

Read `HANDOFF.md` and `DECISIONS.md` before making non-trivial changes.
`DECISIONS.md` is a full log of every data, relevance, scope, and tooling
decision made so far, each with *why*, not just the choice - several
entries directly constrain the front-end (the `popularity_score` field and
what it means, why there's no booking widget, the geo fallback hierarchy,
why `neighborhood` is gated behind a city/area selection). Don't reverse a
logged decision without a real reason, and log why if you do.

## Commands

```bash
npm run dev                # Next.js dev server (http://localhost:3000)
npm run build               # production build (also type-checks + lints)
npm run start                # serve the production build

npm run prepare-data         # rebuild data/restaurants.json from data/source/*
npm run push-to-algolia      # push data/restaurants.json + index settings/synonyms to Algolia (admin key, live index)
npm run test-search-quality  # assertion-based relevance suite against the LIVE index (search-only key)

npx tsc --noEmit             # type-check only, faster than a full build
```

There is no unit test runner in this repo - `test-search-quality.js` is
the only test suite, and it's an integration test against the real,
already-configured Algolia index (not a mock). Re-run it after any change
to `scripts/push-to-algolia.js` or index settings; it should stay 18/18.

## Environment

Credentials live in `.env` (gitignored), shaped by `.env.example`. Two
parities of the same values:

- `ALGOLIA_APP_ID` / `ALGOLIA_SEARCH_API_KEY` / `ALGOLIA_ADMIN_API_KEY` /
  `ALGOLIA_INDEX_NAME` - used by the Node scripts (`scripts/*.js`).
- `NEXT_PUBLIC_ALGOLIA_APP_ID` / `NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY` /
  `NEXT_PUBLIC_ALGOLIA_INDEX_NAME` - browser-exposed mirrors for the
  front-end (search-only key only; Next.js inlines `NEXT_PUBLIC_*` into
  the client bundle, so the admin key must never get this prefix).

## Architecture

### Data pipeline (`scripts/`, plain ES module JS, not TypeScript)

One-way, one-time pipeline, run manually, not on every request:

1. `prepare-data.js` joins `data/source/restaurants_list.json` (5,000
   records) with `restaurants_info.csv` on `objectID`, normalizes
   `payment_options` to the four allowed card brands (raw values preserved
   in `payment_options_raw`), and writes `data/restaurants.json`.
2. `push-to-algolia.js` reads `data/restaurants.json`, computes a
   Bayesian-adjusted `popularity_score` per record (corrects for
   restaurants with very few reviews - see DECISIONS.md), drops
   `payment_options_raw` (local provenance only), pushes all records, then
   applies `searchableAttributes` / `attributesForFaceting` /
   `customRanking` / synonyms to the index. Every setting it applies is
   already decided and reasoned about in `DECISIONS.md` - this script
   doesn't make new judgment calls, it encodes ones already made.
3. `test-search-quality.js` runs 18 assertions against the **live** index
   with the search-only key (typo tolerance, chain disambiguation,
   concatenated-word queries, synonyms, empty/no-results handling).

`data/restaurants.json` is the front-end's map of the index record shape -
`types/restaurant.ts`'s `Restaurant` interface is hand-kept in sync with
it and with the fields `push-to-algolia.js` actually sends (notably:
`payment_options_raw` never reaches the index, `popularity_score` is
computed at push time and isn't in the raw JSON).

### Front-end (`app/`, `components/`, `lib/`, `types/` - all TypeScript)

Single-page, fully client-rendered (no server-side InstantSearch state).
`app/page.tsx` renders `SearchApp`, which owns everything.

- **`components/SearchApp.tsx`** is the root: the `<InstantSearch>` +
  `<Configure>` context, and all cross-cutting state - which restaurant is
  focused (drives the modal), mobile view mode (list vs. map), mobile
  filter-sheet open/closed. It also does the desktop-vs-mobile layout
  branch via `lib/useMediaQuery.ts`.
- **Search UI is hand-built on `react-instantsearch` v7 hooks**
  (`useRefinementList`, `useMenu`, `useSearchBox`, `useInfiniteHits`,
  `useCurrentRefinements`, etc.) in `components/FacetSidebar.tsx`,
  `SearchHeader.tsx`, `ResultsGrid.tsx` - not the pre-built widget
  components. This was a deliberate choice to match the design's chip/
  segmented-button styling precisely; don't reach for `<RefinementList>`
  or similar widgets without checking whether a hook-based custom
  component already exists for that facet.
- **Two pieces bypass InstantSearch entirely** and call the Algolia JS
  client directly (`lib/algolia.ts`'s `restaurantsIndex`): the "similar
  restaurants" cross-sell in `components/SimilarRestaurants.tsx` (filtered
  on shared `food_type`/`area`/`price_range`, excluding the current
  `objectID`) and the geo fallback in `lib/geo.ts` (browser geolocation ->
  `aroundLatLng`, else `aroundLatLngViaIP`, passed through `<Configure>`).
  This split (InstantSearch for the standard 80%, direct client calls for
  the bespoke 20%) is intentional - see DECISIONS.md, "[Tooling]
  InstantSearch vs. the raw JS API client."
- **The restaurant focus view is a modal** (`RestaurantModal.tsx`), not a
  routed page - it needs to sit over the search/map/facet state without
  losing it. Don't turn this into a route without re-reading DECISIONS.md,
  "[UX] Restaurant focus view."
- **`area` / `city` / `neighborhood` are a three-level, all-multi-select
  facet hierarchy in `FacetSidebar.tsx`** - not a single-select location
  picker in the header (that pill/dropdown was removed; `SearchHeader.tsx`
  is just the search box now). `area` (51 clean metro/region values) is
  always shown; `city` (916 values) only appears once at least one `area`
  is checked; `neighborhood` (1,062 values) only appears once at least one
  `city` is checked - `GatedCheckboxFacet` in `FacetSidebar.tsx` implements
  that progressive disclosure generically (checked via
  `useCurrentRefinements` for a `gateAttribute`), used for this and for
  `food_type` under `cuisine_category`. See DECISIONS.md, "[UX]
  Area/city/neighborhood as facets, not a single-select location picker."
  Geolocation auto-applies a detected `area` (not `city` - see
  `lib/geo.ts`'s `detectedArea`/`nearestArea`), via the same one-shot,
  clears-itself-on-typing logic `FacetSidebar.tsx`'s `AreaFacet` owns.
- **The map** (`ResultsMap.tsx` + `MapInner.tsx`) is loaded via
  `next/dynamic` with `ssr: false` - Leaflet touches `window` at import
  time and must never be part of the server bundle. `MapInner.tsx` uses a
  custom `L.divIcon` pin (not Leaflet's default marker images) to avoid
  the classic broken-icon-path problem under Next/Webpack, and refits
  bounds to the current hit set on every result change.
- **`react-instantsearch`'s `useCurrentRefinements` returns refinements
  grouped by attribute**, not flattened: `items[].label` is the
  *attribute's* display label (e.g. "city"), and the actual selected
  value + its own label live one level down in `items[].refinements[]`.
  This has already caused one real bug in this codebase (a count header
  reading `group.label` instead of `group.refinements[0].label`) - check
  the grouped shape before consuming this hook.
- **Tailwind v4** is configured via `@theme` in `app/globals.css`, not a
  `tailwind.config.js` - the design's oklch palette is defined there as
  `--color-*` custom properties (`brand`, `page`, `ink`, `muted`, `chip`,
  `gold`, etc.) and consumed as ordinary utility classes (`bg-brand`,
  `text-muted`, ...).
- **No fabricated data**: nothing in the dataset backs "N people viewing
  now," booking/availability, or free-text descriptions - the restaurant
  modal shows real structured fields (address, phone, dining style)
  instead of invented copy, and cards don't carry a promotional tag badge.
  See DECISIONS.md / HANDOFF.md before adding UI that implies data that
  isn't there.

### Explicitly out of scope right now

No date/time/party-size booking UI, no account/login/favourites, no
Insights/analytics event tracking (deferred to a later task - don't wire
up click/conversion events unless specifically asked).
