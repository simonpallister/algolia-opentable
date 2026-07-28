/**
 * test-search-quality.js
 *
 * Automated relevance/search-quality checks against the live index, using
 * real names and cuisines pulled from the actual dataset (not invented
 * examples). Uses the search-only API key, this script only reads.
 *
 * Covers the specific scenarios the brief asks about directly: "how the
 * experience should behave when the query is broad, specific, misspelled,
 * ambiguous, location-sensitive, or empty" - plus the two named pain
 * points from the discovery notes: typos/concatenated words/partial
 * names, and restaurant chains with multiple locations causing ambiguity.
 *
 * Some checks are hard assertions (pass/fail). A few are deliberately
 * left as "print results for a human to judge" where there isn't a
 * single objectively correct answer (e.g. how good is "grill" as a
 * query), the brief asks us to reason about quality, not just assert it.
 *
 * Run with: npm run test-search-quality
 */

import "dotenv/config";
import algoliasearch from "algoliasearch";

const { ALGOLIA_APP_ID, ALGOLIA_SEARCH_API_KEY, ALGOLIA_INDEX_NAME } = process.env;

if (!ALGOLIA_APP_ID || !ALGOLIA_SEARCH_API_KEY || !ALGOLIA_INDEX_NAME) {
  throw new Error("Missing ALGOLIA_APP_ID / ALGOLIA_SEARCH_API_KEY / ALGOLIA_INDEX_NAME in .env");
}

const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_SEARCH_API_KEY);
const index = client.initIndex(ALGOLIA_INDEX_NAME);

let passed = 0;
let failed = 0;

async function check(label, fn) {
  try {
    const ok = await fn();
    if (ok) {
      passed++;
      console.log(`  PASS  ${label}`);
    } else {
      failed++;
      console.log(`  FAIL  ${label}`);
    }
  } catch (err) {
    failed++;
    console.log(`  ERROR ${label} -> ${err.message}`);
  }
}

function containsObjectID(hits, objectID) {
  return hits.some((h) => h.objectID === objectID);
}

async function main() {
  console.log(`Running search-quality checks against index "${ALGOLIA_INDEX_NAME}"\n`);

  // --- 1. Typo tolerance (real names, deliberately misspelled) -----------
  console.log("1. Typo tolerance");
  await check('typo "Sociall" finds Sociale (San Francisco, objectID 2131)', async () => {
    const { hits } = await index.search("Sociall", { hitsPerPage: 5 });
    return containsObjectID(hits, "2131");
  });
  await check('typo "Vinotopya" finds Vinotopia Restaurant and Bar (objectID 145693)', async () => {
    const { hits } = await index.search("Vinotopya", { hitsPerPage: 5 });
    return containsObjectID(hits, "145693");
  });
  await check('typo "Coccotte" finds Cocotte (objectID 148)', async () => {
    const { hits } = await index.search("Coccotte", { hitsPerPage: 5 });
    return containsObjectID(hits, "148");
  });

  // --- 2. Concatenated words (named pain point in the discovery notes) ---
  console.log("\n2. Concatenated words");
  await check('"unionkitchen" (no space) still finds The Union Kitchen', async () => {
    const { hits } = await index.search("unionkitchen", { hitsPerPage: 10 });
    return containsObjectID(hits, "82522") || containsObjectID(hits, "69292");
  });
  await check('"vinotopiarestaurant" (concatenated) finds Vinotopia', async () => {
    const { hits } = await index.search("vinotopiarestaurant", { hitsPerPage: 10 });
    return containsObjectID(hits, "145693");
  });

  // --- 3. Partial name / prefix matching ----------------------------------
  console.log("\n3. Partial name matching");
  await check('"Pappas" (partial) finds both Pappas Bros. Steakhouse locations', async () => {
    const { hits } = await index.search("Pappas", { hitsPerPage: 10 });
    const pappasHits = hits.filter((h) => h.name.includes("Pappas Bros"));
    return pappasHits.length >= 2;
  });

  // --- 4. Chain disambiguation (named pain point: multiple locations, ----
  //        same city) -----------------------------------------------------
  console.log("\n4. Chain disambiguation (same brand, same city)");
  await check('"Union Kitchen" returns both Houston locations (Memorial Dr + Bellaire)', async () => {
    const { hits } = await index.search("Union Kitchen", { hitsPerPage: 10 });
    return containsObjectID(hits, "82522") && containsObjectID(hits, "69292");
  });
  await check('"Union Kitchen" near Bellaire coordinates ranks Bellaire location first', async () => {
    // Bellaire, Houston approx coordinates - proves geo can be the
    // disambiguator between two otherwise-identical-looking results.
    const { hits } = await index.search("Union Kitchen", {
      hitsPerPage: 10,
      aroundLatLng: "29.7049, -95.4600",
      aroundRadius: 50000,
    });
    return hits.length > 0 && hits[0].objectID === "69292";
  });

  // --- 5. Cuisine text search, including misspelled -----------------------
  console.log("\n5. Cuisine search (broad + misspelled)");
  await check('"sushi" returns predominantly Sushi restaurants', async () => {
    const { hits } = await index.search("sushi", { hitsPerPage: 20 });
    const sushiCount = hits.filter((h) => h.food_type === "Sushi").length;
    return hits.length > 0 && sushiCount / hits.length >= 0.5;
  });
  await check('misspelled "itallian" still returns Italian restaurants', async () => {
    const { hits } = await index.search("itallian", { hitsPerPage: 20 });
    const italianCount = hits.filter((h) => h.food_type === "Italian").length;
    return italianCount > 0;
  });
  await check(
    '"asian" (category-level query) reaches the full cuisine_category group (219), not just food_type==="Asian" (61)',
    async () => {
      // Aggregate check, not a specific objectID: with cuisine_category
      // searchable, nbHits should approach the full 219-record category,
      // not stay pinned near the 61 that literally have food_type "Asian".
      // A specific record like "Top of Waikiki" (objectID 86731, the
      // example that proved the gap) isn't a reliable pin here, it's a
      // modest performer among 219 now-competing candidates and can rank
      // outside any fixed hitsPerPage window, this checks the aggregate
      // effect instead.
      const { nbHits } = await index.search("asian", { hitsPerPage: 1 });
      return nbHits >= 150;
    }
  );
  await check(
    '"bbq" reaches the Southern/Creole/BBQ category (126), not just the 5 restaurants with "bbq"/"barbecue" in their name',
    async () => {
      const { nbHits } = await index.search("bbq", { hitsPerPage: 1 });
      return nbHits >= 100;
    }
  );
  await check('"fine dining seafood" combines dining_style + cuisine correctly', async () => {
    // Truluck's Seafood, Steak and Crab House - Houston (objectID 4113):
    // dining_style "Fine Dining", food_type "Seafood".
    const { hits } = await index.search("fine dining seafood", { hitsPerPage: 30 });
    return containsObjectID(hits, "4113");
  });

  // --- 6. Location-embedded query (no separate "location mode" needed) ---
  console.log("\n6. Location embedded in free text");
  await check('"Houston" (as text, not a filter) returns predominantly Houston results', async () => {
    const { hits } = await index.search("Houston", { hitsPerPage: 20 });
    const houstonCount = hits.filter((h) => h.city === "Houston").length;
    return hits.length > 0 && houstonCount / hits.length >= 0.5;
  });
  await check('"sushi Houston" combines cuisine + location correctly', async () => {
    const { hits } = await index.search("sushi Houston", { hitsPerPage: 20 });
    const relevant = hits.filter((h) => h.food_type === "Sushi" && h.city === "Houston");
    return relevant.length > 0;
  });
  await check('"tx japanese" (state abbreviation + cuisine) returns TX Japanese/Sushi results', async () => {
    const { hits } = await index.search("tx japanese", { hitsPerPage: 30 });
    const relevant = hits.filter(
      (h) => h.state === "TX" && (h.food_type === "Japanese" || h.food_type === "Sushi")
    );
    return relevant.length > 0;
  });
  await check('"texas sushi" (full state name + cuisine) returns TX Sushi/Japanese results', async () => {
    const { hits } = await index.search("texas sushi", { hitsPerPage: 30 });
    const relevant = hits.filter(
      (h) => h.state === "TX" && (h.food_type === "Sushi" || h.food_type === "Japanese")
    );
    return relevant.length > 0;
  });

  // --- 7. Broad / ambiguous query (qualitative, no single correct answer) -
  console.log("\n7. Broad/ambiguous query (qualitative - inspect manually)");
  {
    const { hits, nbHits } = await index.search("grill", { hitsPerPage: 5 });
    console.log(`  "grill" -> ${nbHits} total results. Top 5:`);
    hits.forEach((h) =>
      console.log(`    - ${h.name} (${h.food_type}, ${h.city}, popularity_score ${h.popularity_score})`)
    );
  }

  // --- 8. Empty query (should browse, ranked by customRanking, not error) -
  console.log("\n8. Empty query behaviour");
  await check("empty query returns results without error", async () => {
    const { hits } = await index.search("", { hitsPerPage: 5 });
    return hits.length === 5;
  });
  await check("empty query results are ordered by popularity_score (customRanking)", async () => {
    const { hits } = await index.search("", { hitsPerPage: 10 });
    for (let i = 0; i < hits.length - 1; i++) {
      if (hits[i].popularity_score < hits[i + 1].popularity_score) return false;
    }
    return true;
  });

  // --- 9. No-results query (nonsense input) -------------------------------
  console.log("\n9. No-results handling");
  await check("nonsense query returns 0 hits without erroring", async () => {
    const { nbHits } = await index.search("zzxxqqjjbbnnasdkfjaslkdfj", { hitsPerPage: 5 });
    return nbHits === 0;
  });

  // --- 10. Synonyms --------------------------------------------------------
  console.log("\n10. Synonyms");
  await check('"creole" also returns Cajun / Creole-Cajun-Southern restaurants', async () => {
    const { hits } = await index.search("creole", { hitsPerPage: 30 });
    return hits.some((h) => h.food_type === "Cajun" || h.food_type === "Creole / Cajun / Southern");
  });
  await check('"american" also returns Contemporary American restaurants (one-way)', async () => {
    const { hits } = await index.search("american", { hitsPerPage: 30 });
    return hits.some((h) => h.food_type === "Contemporary American");
  });
  await check(
    '"contemporary american" stays specific (one-way synonym doesn\'t broaden back to plain American)',
    async () => {
      const { hits } = await index.search("contemporary american", { hitsPerPage: 20 });
      const contemporaryCount = hits.filter((h) => h.food_type === "Contemporary American").length;
      return hits.length > 0 && contemporaryCount / hits.length >= 0.5;
    }
  );
  await check('"steakhouse" also returns restaurants tagged plainly "Steak" (one-way, edit distance exceeds default typo tolerance)', async () => {
    const { hits } = await index.search("steakhouse", { hitsPerPage: 30 });
    return hits.some((h) => h.food_type === "Steak");
  });
  await check('"steak" stays broad and still reaches Steakhouse too (already true via prefix matching, unaffected by the one-way synonym)', async () => {
    const { hits } = await index.search("steak", { hitsPerPage: 30 });
    return hits.some((h) => h.food_type === "Steakhouse");
  });
  await check('"hawaiian" also returns Hawaii Regional Cuisine restaurants (edit distance exceeds default typo tolerance)', async () => {
    const { hits } = await index.search("hawaiian", { hitsPerPage: 30 });
    return hits.some((h) => h.food_type === "Hawaii Regional Cuisine");
  });

  // --- Summary -------------------------------------------------------------
  console.log(`\n${passed} passed, ${failed} failed (out of ${passed + failed} assertions)`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test run failed to complete:", err);
  process.exit(1);
});
