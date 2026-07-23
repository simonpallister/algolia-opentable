"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useHits, useSearchBox } from "react-instantsearch";
import type { Restaurant } from "@/types/restaurant";
import { MIN_QUERY_LENGTH_FOR_RESULTS } from "@/lib/searchConfig";

// Leaflet touches `window` at module scope, so it can never be part of the
// server-rendered bundle - loaded client-only, after mount.
const MapInner = dynamic(() => import("./MapInner"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center text-xs text-muted font-mono bg-map-bg">
      loading map…
    </div>
  ),
});

export default function ResultsMap({
  fallbackCenter,
  onSelectRestaurant,
}: {
  fallbackCenter?: { lat: number; lng: number };
  onSelectRestaurant: (restaurant: Restaurant) => void;
}) {
  const { hits } = useHits<Restaurant>();
  const { query } = useSearchBox();
  const trimmedQueryLength = query.trim().length;
  const queryTooShort =
    trimmedQueryLength > 0 && trimmedQueryLength < MIN_QUERY_LENGTH_FOR_RESULTS;

  // Same reasoning as ResultsGrid.tsx: below the minimum query length,
  // keep showing the last real hit set instead of clearing the map's pins
  // to nothing while a noisy short query is live.
  const [frozenHits, setFrozenHits] = useState(hits);
  useEffect(() => {
    if (!queryTooShort) {
      setFrozenHits(hits);
    }
  }, [queryTooShort, hits]);

  return (
    <MapInner
      hits={queryTooShort ? frozenHits : hits}
      fallbackCenter={fallbackCenter}
      onSelectRestaurant={onSelectRestaurant}
    />
  );
}
