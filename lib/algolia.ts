/**
 * Algolia clients for the pieces that aren't InstantSearch widgets: the
 * "similar restaurants" cross-sell query (see components/SimilarRestaurants
 * .tsx). InstantSearch gets its own `algoliasearch/lite` client instance
 * (the trimmed build meant for federated InstantSearch queries only, no
 * `initIndex`), while the direct single-index query uses the full client -
 * this mirrors HANDOFF.md's split between react-instantsearch widgets and
 * direct `algoliasearch` JS API client calls for the bespoke pieces.
 *
 * Both use the search-only API key - this file only ever runs in the
 * browser (every importer is 'use client'), so nothing here is safe to
 * point at the admin key.
 */

import algoliasearchLite from "algoliasearch/lite";
import algoliasearch from "algoliasearch";

const appId = process.env.NEXT_PUBLIC_ALGOLIA_APP_ID ?? "";
const searchApiKey = process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY ?? "";

export const ALGOLIA_INDEX_NAME =
  process.env.NEXT_PUBLIC_ALGOLIA_INDEX_NAME ?? "restaurants";

if (!appId || !searchApiKey) {
  // Fails loudly in dev rather than shipping a silently-broken search box.
  console.error(
    "Missing NEXT_PUBLIC_ALGOLIA_APP_ID / NEXT_PUBLIC_ALGOLIA_SEARCH_API_KEY - " +
      "check .env and restart `next dev`."
  );
}

/** For <InstantSearch searchClient={...}>. */
export const searchClient = algoliasearchLite(appId, searchApiKey);

/** For direct, non-InstantSearch queries (similar restaurants). */
export const restaurantsIndex = algoliasearch(
  appId,
  searchApiKey
).initIndex(ALGOLIA_INDEX_NAME);
