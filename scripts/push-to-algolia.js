/**
 * push-to-algolia.js
 *
 * Takes data/restaurants.json (produced by prepare-data.js) and:
 *
 *   1. Computes a Bayesian-adjusted `popularity_score` per record, the
 *      customRanking fix for the ratings vanity-metric problem (see
 *      DECISIONS.md -> "Custom ranking: Bayesian-adjusted rating").
 *   2. Pushes records to the Algolia index, dropping `payment_options_raw`,
 *      which is a local debugging/provenance field only, not needed by
 *      the search experience (see DECISIONS.md -> "Payment options
 *      normalisation"). `image_url` IS pushed and used as-is, despite
 *      being confirmed dead (see DECISIONS.md -> "Dead image_url field")
 *      - it's real customer-provided data, used as presented, same as
 *      every other field, not suppressed because it happens to be stale.
 *   3. Applies every agreed index setting: searchableAttributes,
 *      attributesForFaceting, customRanking.
 *   4. Applies the manually curated cuisine synonyms (see DECISIONS.md ->
 *      "Synonyms: manual curation now, AI Synonyms as roadmap").
 *
 * Every decision reflected here was already made and logged in
 * DECISIONS.md, nothing new is decided in this script.
 */

import "dotenv/config"
import { readFileSync } from "fs"
import path from "path"
import { fileURLToPath } from "url"
import algoliasearch from "algoliasearch"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_PATH = path.join(__dirname, "..", "data", "restaurants.json")

const { ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY, ALGOLIA_INDEX_NAME } = process.env

if (!ALGOLIA_APP_ID || !ALGOLIA_ADMIN_API_KEY || !ALGOLIA_INDEX_NAME) {
  throw new Error("Missing ALGOLIA_APP_ID / ALGOLIA_ADMIN_API_KEY / ALGOLIA_INDEX_NAME in .env")
}

// --- Bayesian-adjusted rating -------------------------------------------
//
//   score = (v / (v + m)) * R + (m / (v + m)) * C
//
//   R = restaurant's own stars_count
//   v = restaurant's own reviews_count
//   C = dataset-wide mean stars_count (computed here, not hardcoded, so
//       this stays correct if the dataset ever changes)
//   m = median reviews_count across the dataset (the "how much evidence
//       do we need before trusting this restaurant's own rating"
//       threshold, a judgment call - see DECISIONS.md)

function computeGlobalMeanStars(records) {
  const sum = records.reduce((acc, r) => acc + r.stars_count, 0)
  return sum / records.length
}

function computeMedianReviews(records) {
  const sorted = records.map(r => r.reviews_count).sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function withPopularityScore(records) {
  const C = computeGlobalMeanStars(records)
  const m = computeMedianReviews(records)
  console.log(`Bayesian ranking: C (global mean stars) = ${C.toFixed(3)}, m (median reviews) = ${m}`)

  return records.map(r => {
    const v = r.reviews_count
    const R = r.stars_count
    const popularity_score = (v / (v + m)) * R + (m / (v + m)) * C
    return { ...r, popularity_score: Number(popularity_score.toFixed(4)) }
  })
}

// --- Index settings ------------------------------------------------------
// See DECISIONS.md for the reasoning behind every choice below.

const INDEX_SETTINGS = {
  searchableAttributes: ["name", "food_type", "city,area,neighborhood,state,state_name", "address"],
  attributesForFaceting: [
    "cuisine_category",
    "food_type",
    "city",
    "neighborhood",
    "area",
    "price_range",
    "price_display",
    "dining_style",
    "payment_options",
  ],
  customRanking: ["desc(popularity_score)", "desc(reviews_count)"],
  // `ranking` deliberately left at Algolia's default (typo, geo, words,
  // filters, proximity, attribute, exact, custom) - geo already sits at
  // position 2, which is exactly the proximity weighting we want once
  // aroundLatLng / aroundLatLngViaIP is supplied at query time.
  //
  // Typo tolerance deliberately left at Algolia's default for now -
  // testing/tuning against real dataset names is a deferred follow-up.
}

// --- Synonyms --------------------------------------------------------------
// Manually curated from genuine near-duplicate `food_type` values found
// in the actual dataset. This is deliberately NOT a full cuisine taxonomy,
// that's a separate, still-deferred `cuisine_category` grouping decision.

const SYNONYMS = [
  {
    objectID: "synonym-creole-cajun",
    type: "synonym",
    synonyms: ["creole", "cajun", "creole / cajun / southern"],
  },
  {
    objectID: "synonym-american-contemporary",
    type: "oneWaySynonym",
    input: "american",
    synonyms: ["contemporary american"],
  },
]

async function main() {
  const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY)
  const index = client.initIndex(ALGOLIA_INDEX_NAME)

  const rawRecords = JSON.parse(readFileSync(DATA_PATH, "utf-8"))
  const records = withPopularityScore(rawRecords).map(({ payment_options_raw, ...rest }) => rest)

  console.log(`Pushing ${records.length} records to index "${ALGOLIA_INDEX_NAME}"...`)
  await index.saveObjects(records)

  console.log("Applying index settings...")
  await index.setSettings(INDEX_SETTINGS)

  console.log("Applying synonyms...")
  await index.saveSynonyms(SYNONYMS, { replaceExistingSynonyms: true })

  console.log("Done.")
  console.log("Sample record pushed:")
  console.log(JSON.stringify(records[0], null, 2))
}

main().catch(err => {
  console.error("Failed to push to Algolia:", err)
  process.exit(1)
})
