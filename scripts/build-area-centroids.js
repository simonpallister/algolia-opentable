/**
 * build-area-centroids.js
 *
 * Reads data/restaurants.json, groups records by `area`, averages each
 * group's `_geoloc`, and writes data/area-centroids.json as
 * `{ [area]: { lat, lng } }`.
 *
 * lib/geo.ts needs to turn a real (lat, lng) from
 * browser geolocation into an `area` value that matches the Algolia `area`
 * facet exactly, so the area facet checkbox, the map, and the free-text
 * search all agree on "where the user is." `area` (51 clean values) is the
 * top-level geo-browse facet - see DECISIONS.md, "Geography fields: what
 * each one is actually for" and "[UX] Area/city/neighborhood as facets,
 * not a single-select location picker."
 *
 * Run as part of/after `npm run prepare-data`. Also exposed standalone as
 * `npm run build-area-centroids` for re-running in isolation.
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

function main() {
  const restaurantsPath = path.join(DATA_DIR, "restaurants.json");
  const records = JSON.parse(readFileSync(restaurantsPath, "utf-8"));

  const sums = new Map(); // area -> { lat, lng, count }
  for (const record of records) {
    const { area, _geoloc } = record;
    if (!area || !_geoloc || typeof _geoloc.lat !== "number" || typeof _geoloc.lng !== "number") {
      continue;
    }
    const entry = sums.get(area) || { lat: 0, lng: 0, count: 0 };
    entry.lat += _geoloc.lat;
    entry.lng += _geoloc.lng;
    entry.count += 1;
    sums.set(area, entry);
  }

  const centroids = {};
  for (const [area, { lat, lng, count }] of sums.entries()) {
    centroids[area] = { lat: lat / count, lng: lng / count };
  }

  const outputPath = path.join(DATA_DIR, "area-centroids.json");
  writeFileSync(outputPath, JSON.stringify(centroids, null, 2));

  console.log(
    `Wrote ${Object.keys(centroids).length} area centroids -> ${path.relative(process.cwd(), outputPath)}`
  );
}

main();
