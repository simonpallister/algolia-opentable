"use client";

import { useEffect, useState } from "react";
import { useInstantSearch } from "react-instantsearch";
import areaCentroids from "@/data/area-centroids.json";

/**
 * The location fallback hierarchy from DECISIONS.md ("[UX] Map view, both
 * personas, Leaflet + OpenStreetMap"):
 *
 *   1. Browser geolocation granted -> `aroundLatLng` with real coordinates.
 *   2. Not granted -> Algolia's native `aroundLatLngViaIP`, geolocating the
 *      request server-side by IP.
 *   3. User types a place name -> ordinary text relevance already handles
 *      this (city/area/neighborhood are searchable attributes), nothing to
 *      build here.
 *
 * Both of the first two are native Algolia query parameters - this hook's
 * only job is deciding which one to pass to <Configure>, not implementing
 * geolocation itself.
 *
 * Area detection (`useDetectedArea` below) covers *both* tiers - see
 * DECISIONS.md, "[UX] Area/city/neighborhood as facets, not a single-select
 * location picker" / "[Fix] IP-geolocated area detection." An earlier
 * version of this comment claimed tier 2's IP-resolved coordinate "never
 * reaches the client" - that was wrong: Algolia's response *does* echo an
 * IP-guessed position back as a top-level `aroundLatLng` string
 * (`algoliasearch-helper`'s `SearchResults` documents it as "the position
 * if the position was guessed by IP"). But that field is IP-guess-only -
 * confirmed directly against the live API that a query supplying a real
 * `aroundLatLng` (tier 1) gets a response with no such key at all, since
 * the server has nothing to "guess." So `useDetectedArea` takes the tier-1
 * coordinate directly as a parameter (already known client-side, no need
 * to wait for a response) and only falls back to reading it off `results`
 * for tier 2, where it's the only way to get at the server-guessed value.
 */

export type GeoStatus = "pending" | "granted" | "unavailable";

export interface GeoParams {
  status: GeoStatus;
  /** Pass straight through to <Configure aroundLatLng={...} />. */
  aroundLatLng?: string;
  /** Pass straight through to <Configure aroundLatLngViaIP={...} />. */
  aroundLatLngViaIP?: boolean;
  /** For centering the map before any results/geoloc are available. */
  coords?: { lat: number; lng: number };
}

const GEOLOCATION_TIMEOUT_MS = 6000;

/**
 * Reject a "nearest" match beyond this radius. Without a cutoff,
 * `nearestArea` always returns *some* area, even for a user thousands of
 * kilometers from every centroid in the dataset (e.g. testing from outside
 * the US) - confirmed by manual testing, where a Sydney, Australia
 * coordinate matched to a small US town's centroid ~15,000km away. 150km
 * (wider than the 80km used when this targeted the smaller `city` facet)
 * since `area` values are broad metro/state-level regions - "you're in the
 * Denver / Colorado area" still holds true from further out than a specific
 * city claim would.
 */
const MAX_DETECTION_DISTANCE_KM = 150;

const AREA_CENTROIDS = areaCentroids as Record<string, { lat: number; lng: number }>;

/** Great-circle distance in km - only used to rank areas by proximity, so
 * the exact units don't matter, only that closer stays closer. */
function haversineDistanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const EARTH_RADIUS_KM = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Nearest `area` facet value to a coordinate, or `undefined` if nothing in
 * `data/area-centroids.json` is within `MAX_DETECTION_DISTANCE_KM`. Exported
 * so both the browser-geolocation path (`useGeoParams`, via a real
 * coordinate) and the IP-guessed path (`useDetectedArea`, via the
 * coordinate Algolia echoes back on the response) can share one
 * implementation instead of each computing "nearest area" independently.
 */
export function nearestArea(lat: number, lng: number): string | undefined {
  let closestArea: string | undefined;
  let closestDistance = Infinity;
  for (const [area, centroid] of Object.entries(AREA_CENTROIDS)) {
    const distance = haversineDistanceKm({ lat, lng }, centroid);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestArea = area;
    }
  }
  return closestDistance <= MAX_DETECTION_DISTANCE_KM ? closestArea : undefined;
}

export function useGeoParams(): GeoParams {
  // Default to the IP fallback immediately rather than querying with no geo
  // param at all while the (possibly slow, possibly never-answered)
  // permission prompt is pending - upgraded to real coordinates below if
  // the user grants permission.
  const [state, setState] = useState<GeoParams>({
    status: "pending",
    aroundLatLngViaIP: true,
  });

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setState({ status: "unavailable", aroundLatLngViaIP: true });
      return;
    }

    let settled = false;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (settled) return;
        settled = true;
        const { latitude, longitude } = position.coords;
        setState({
          status: "granted",
          aroundLatLng: `${latitude},${longitude}`,
          coords: { lat: latitude, lng: longitude },
        });
      },
      () => {
        if (settled) return;
        settled = true;
        setState({ status: "unavailable", aroundLatLngViaIP: true });
      },
      { timeout: GEOLOCATION_TIMEOUT_MS }
    );
  }, []);

  return state;
}

/**
 * Parses the `"lat,lng"` string Algolia's search response echoes back as
 * `aroundLatLng` (the coordinate it actually geolocated with - the real
 * browser coordinate on tier 1, or its own IP guess on tier 2) and resolves
 * it to a nearest `area`, or `undefined` if it's missing/malformed/too far
 * from every centroid.
 */
function nearestAreaFromLatLngString(value?: string): string | undefined {
  if (!value) return undefined;
  const [latStr, lngStr] = value.split(",");
  const lat = Number(latStr);
  const lng = Number(lngStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return nearestArea(lat, lng);
}

/**
 * Nearest `area` to wherever the visitor actually is, from whichever
 * source is available:
 *
 * - Tier 1 (browser geolocation granted): the real coordinate is already
 *   known client-side (`geo.aroundLatLng` from `useGeoParams`) - pass it
 *   as `knownAroundLatLng` and it's used directly, computed synchronously,
 *   no need to wait for a response.
 * - Tier 2 (IP fallback, `knownAroundLatLng` omitted/undefined): there is
 *   no client-side coordinate to compute from, so this falls back to
 *   `results.aroundLatLng` - but confirmed directly against the live API
 *   that Algolia only ever populates that field when the position was
 *   *guessed* server-side (IP); a query that supplies a real `aroundLatLng`
 *   gets back a response with no such key at all. So this fallback path
 *   only ever fires anything for tier 2 - never a live coordinate a caller
 *   already has, which is exactly the case it exists for.
 *
 * An earlier version of this ignored the known tier-1 coordinate entirely
 * and read `results.aroundLatLng` unconditionally - which silently broke
 * tier-1 detection (that field is simply absent from the response in that
 * case), confirmed live: granting geolocation and overriding it to a real
 * US city still showed the full unfiltered set. Restoring the direct,
 * synchronous tier-1 computation (as it worked before "[Fix] IP-geolocated
 * area detection" in DECISIONS.md) while keeping the tier-2 addition from
 * that same fix is what this version does.
 *
 * Must be called inside `<InstantSearch>` (needed for the tier-2 fallback
 * even when a tier-1 coordinate makes that branch unused this render).
 *
 * Returns `hasCoordinate` alongside `area` so a caller can tell "we don't
 * have anything to check yet" (still waiting on tier 1's permission
 * prompt or tier 2's first response - `hasCoordinate: false`) apart from
 * "we checked a real coordinate and it's just too far from every area"
 * (`hasCoordinate: true`, `area: undefined` - e.g. a visitor genuinely
 * outside this US-only dataset's coverage, see DECISIONS.md, "[UX]
 * Default area fallback when detection is out of range"). Only the
 * latter is a meaningful signal to fall back to a default.
 */
export function useDetectedArea(knownAroundLatLng?: string): {
  area: string | undefined;
  hasCoordinate: boolean;
} {
  const { results } = useInstantSearch();
  const source = knownAroundLatLng ?? results?.aroundLatLng;
  return { area: nearestAreaFromLatLngString(source), hasCoordinate: Boolean(source) };
}
