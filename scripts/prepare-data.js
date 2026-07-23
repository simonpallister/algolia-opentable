/**
 * prepare-data.js
 *
 * Joins the two source files provided by OpenTable and produces a single
 * clean, flat JSON array ready to push to Algolia.
 *
 *   - data/source/restaurants_list.json  (~5,000 records, as provided)
 *   - data/source/restaurants_info.csv   (~5,000 rows, as provided)
 *
 * Join key: objectID (numeric in both files; the JSON has it as a number,
 * the CSV has it as a string column, so we normalise both to a Number
 * before joining and then emit it as a String, since Algolia objectIDs
 * are strings).
 *
 * This script only joins + cleans the data. It does NOT decide which
 * attributes are searchable/facetable/used for ranking - that's an
 * Algolia index-configuration decision made separately in
 * scripts/push-to-algolia.js, so it can be discussed and iterated on
 * without re-running the join.
 *
 * Assumptions made here (call these out in the debrief):
 *
 * 1. Payment options: the brief says the demo should only expose AMEX,
 *    Visa, Discover and MasterCard, with Diners Club and Carte Blanche
 *    folded into Discover. The raw data also contains "Cash Only",
 *    "Pay with OpenTable" and "JCB" - none of which map to a card in the
 *    allowed list, so they are dropped from the normalised
 *    `payment_options` facet field. The original, unmodified list is kept
 *    in `payment_options_raw` so nothing is silently lost.
 *
 * 2. Price: the JSON `price` field (2-4, OpenTable's $ tier) and the CSV
 *    `price_range` field (a text bucket) are correlated but NOT identical
 *    - about 4% of records disagree (e.g. price=2 but price_range="$31 to
 *    $50"). Both are kept: `price_range` (text) is used as the
 *    customer-facing facet since it's self-explanatory, `price` (number)
 *    is kept for potential use in ranking/sorting or a "$" display.
 *
 * 3. Every JSON record had a matching CSV row (verified: 0 missing joins
 *    across 5,000 records), so no fallback/default logic was needed for
 *    missing food_type/stars/etc. If that changes, this script will throw
 *    rather than silently index incomplete records.
 *
 * 4. `image_url` is kept and used as-is, despite being confirmed dead
 *    (see scripts/check-image-urls.js: 30/30 sampled records redirect to
 *    the same generic OpenTable placeholder image, not a real photo).
 *    It's real customer-provided data, used the same way every other
 *    field is, not suppressed because it happens to be stale. See
 *    DECISIONS.md -> "Dead image_url field."
 *
 * Enrichments added at this stage (pure formatting, no relevance/ranking
 * judgment involved - see DECISIONS.md for enrichments that were
 * considered but deferred to the index-configuration stage instead):
 *
 * - `state_name`: full US state name derived from the 2-letter code, for
 *   display purposes.
 * - `price_display`: the numeric `price` tier (2-4) rendered as
 *   conventional $/$$/$$$/$$$$ signage, shown alongside `price_range`
 *   rather than replacing it.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { parse } from "csv-parse/sync";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATASET_DIR = path.join(__dirname, "..", "data", "source");
const OUTPUT_DIR = path.join(__dirname, "..", "data");

const US_STATE_NAMES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

// OpenTable's price tier (2-4 in this dataset) mapped to conventional
// dollar-sign display. Kept alongside the numeric value and the
// human-readable price_range bucket rather than replacing either.
const PRICE_TIER_DISPLAY = {
  1: "$",
  2: "$$",
  3: "$$$",
  4: "$$$$",
};

// `cuisine_category` groups the 114 raw `food_type` values into 13
// browse-friendly buckets for the primary Cuisine facet (`food_type` stays
// untouched underneath for precise second-level filtering/search). Grouping
// agreed and hand-reviewed offline - see DECISIONS.md, "Cuisine grouping"
// for the categories and the judgment calls behind them (e.g. Californian
// folded into American rather than standalone, Sushi folded into Japanese).
const CUISINE_CATEGORIES = {
  "American": [
    "American", "Contemporary American", "Comfort Food", "Northwest",
    "Southwest", "Contemporary French / American", "French American",
    "Burgers", "Bar / Lounge / Bottle Service", "Wine Bar", "Bistro",
    "Prime Rib", "Breakfast", "Californian",
  ],
  "Italian": ["Italian", "Pizzeria", "Contemporary Italian", "Sicilian"],
  "Steakhouse": ["Steakhouse", "Steak", "Brazilian Steakhouse"],
  "Seafood": ["Seafood"],
  "French": ["French", "Contemporary French", "Provencal"],
  "Japanese": ["Japanese", "Sushi", "Hibachi"],
  "Mexican & Latin American": [
    "Mexican", "Mexican / Southwestern", "Latin American", "Peruvian",
    "Caribbean", "Cuban", "Contemporary Mexican", "Tex-Mex", "Brazilian",
    "Argentinean", "Puerto Rican", "South American", "Traditional Mexican",
    "Regional Mexican",
  ],
  "Indian": ["Indian", "Contemporary Indian", "South Indian"],
  "Asian": [
    "Asian", "Fusion / Eclectic", "Hawaii Regional Cuisine", "Thai",
    "Chinese", "Pan-Asian", "Hawaiian", "Korean", "Contemporary Asian",
    "Southeast Asian", "Vietnamese", "Dim Sum", "Filipino", "Burmese",
    "Pacific Rim", "Eurasian", "Polynesian",
  ],
  "Mediterranean & Middle Eastern": [
    "Mediterranean", "Greek", "Turkish", "Persian", "Middle Eastern",
    "Moroccan", "Lebanese", "Afghan", "Syrian",
  ],
  "Spanish & Tapas": [
    "Spanish", "Tapas / Small Plates", "Latin / Spanish", "Portuguese",
    "Basque",
  ],
  "Southern, Creole & BBQ": [
    "Southern", "Creole / Cajun / Southern", "Barbecue", "Creole",
    "Contemporary Southern", "Cajun", "Low Country",
  ],
  "Global, International & Other": [
    "Gastro Pub", "Global, International", "Continental", "Fondue",
    "International", "European", "Organic", "Contemporary European",
    "Modern European", "Irish", "German", "Belgian", "Afternoon Tea",
    "Swiss", "Kosher", "Brewery", "Scandinavian", "English", "British",
    "Ethiopian", "South African", "African", "Russian", "Austrian",
    "Eastern European", "Vegetarian", "Vegan", "Wild Game", "Beer Garden",
    "Australian", "Modern Australian",
  ],
};

const FOOD_TYPE_TO_CATEGORY = {};
for (const [category, foodTypes] of Object.entries(CUISINE_CATEGORIES)) {
  for (const foodType of foodTypes) {
    FOOD_TYPE_TO_CATEGORY[foodType] = category;
  }
}

const PAYMENT_NORMALISATION_MAP = {
  "AMEX": "AMEX",
  "American Express": "AMEX",
  "Visa": "Visa",
  "MasterCard": "MasterCard",
  "Discover": "Discover",
  "Diners Club": "Discover",
  "Carte Blanche": "Discover",
  // Deliberately unmapped -> dropped from the normalised facet:
  // "Cash Only", "Pay with OpenTable", "JCB"
};

function normalisePaymentOptions(rawOptions) {
  const normalised = new Set();
  for (const option of rawOptions || []) {
    const mapped = PAYMENT_NORMALISATION_MAP[option];
    if (mapped) normalised.add(mapped);
  }
  return Array.from(normalised);
}

function cuisineCategoryFor(foodType) {
  const category = FOOD_TYPE_TO_CATEGORY[foodType];
  if (!category) {
    throw new Error(
      `Unmapped food_type "${foodType}" - add it to CUISINE_CATEGORIES in prepare-data.js`
    );
  }
  return category;
}

function loadRestaurants() {
  const jsonPath = path.join(DATASET_DIR, "restaurants_list.json");
  const csvPath = path.join(DATASET_DIR, "restaurants_info.csv");

  const restaurants = JSON.parse(readFileSync(jsonPath, "utf-8"));
  const infoRows = parse(readFileSync(csvPath, "utf-8"), {
    columns: true,
    delimiter: ";",
    skip_empty_lines: true,
  });

  const infoByObjectID = new Map();
  for (const row of infoRows) {
    infoByObjectID.set(Number(row.objectID), row);
  }

  const missingJoins = [];
  const records = restaurants.map((restaurant) => {
    const info = infoByObjectID.get(Number(restaurant.objectID));
    if (!info) {
      missingJoins.push(restaurant.objectID);
      return null;
    }

    return {
      objectID: String(restaurant.objectID),
      name: restaurant.name,
      address: restaurant.address,
      neighborhood: info.neighborhood,
      area: restaurant.area,
      city: restaurant.city,
      state: restaurant.state,
      state_name: US_STATE_NAMES[restaurant.state] || restaurant.state,
      postal_code: restaurant.postal_code,
      country: restaurant.country,
      _geoloc: restaurant._geoloc,
      phone: info.phone_number || restaurant.phone || null,
      food_type: info.food_type,
      cuisine_category: cuisineCategoryFor(info.food_type),
      dining_style: info.dining_style,
      price: Number(restaurant.price),
      price_display: PRICE_TIER_DISPLAY[Number(restaurant.price)] || null,
      price_range: info.price_range,
      stars_count: Number(info.stars_count),
      reviews_count: Number(info.reviews_count),
      payment_options: normalisePaymentOptions(restaurant.payment_options),
      payment_options_raw: restaurant.payment_options || [],
      image_url: restaurant.image_url,
      reserve_url: restaurant.reserve_url,
      mobile_reserve_url: restaurant.mobile_reserve_url,
    };
  }).filter(Boolean);

  if (missingJoins.length > 0) {
    throw new Error(
      `${missingJoins.length} restaurant(s) had no matching CSV row: ${missingJoins.join(", ")}`
    );
  }

  return records;
}

function main() {
  const records = loadRestaurants();
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(OUTPUT_DIR, "restaurants.json");
  writeFileSync(outputPath, JSON.stringify(records, null, 2));

  console.log(`Joined ${records.length} records -> ${path.relative(process.cwd(), outputPath)}`);
  console.log("Sample record:");
  console.log(JSON.stringify(records[0], null, 2));
}

main();
