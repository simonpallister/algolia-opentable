"use client";

import { useEffect, useState } from "react";
import type { Restaurant } from "@/types/restaurant";
import { restaurantsIndex } from "@/lib/algolia";
import RestaurantCard from "./RestaurantCard";

/**
 * The "similar restaurants" cross-sell (see HANDOFF.md): a direct
 * `algoliasearch` client query, not an InstantSearch widget, filtered on
 * shared food_type/area/price_range and excluding the current objectID.
 * This is the deliberate cross-sell moment between the two personas (see
 * DESIGN_PROMPT.md, "you might also like," not a replacement for the
 * original search).
 */
export default function SimilarRestaurants({
  restaurant,
  onSelectRestaurant,
}: {
  restaurant: Restaurant;
  onSelectRestaurant: (restaurant: Restaurant) => void;
}) {
  const [similar, setSimilar] = useState<Restaurant[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSimilar(null);

    const filters = [
      `NOT objectID:"${restaurant.objectID}"`,
      `(food_type:"${restaurant.food_type}" OR area:"${restaurant.area}" OR price_range:"${restaurant.price_range}")`,
    ].join(" AND ");

    restaurantsIndex
      .search<Restaurant>("", { filters, hitsPerPage: 4 })
      .then((res) => {
        if (!cancelled) setSimilar(res.hits);
      })
      .catch((err) => {
        console.error("Similar restaurants query failed:", err);
        if (!cancelled) setSimilar([]);
      });

    return () => {
      cancelled = true;
    };
  }, [restaurant.objectID, restaurant.food_type, restaurant.area, restaurant.price_range]);

  if (similar !== null && similar.length === 0) return null;

  return (
    <div className="mt-9">
      <div className="font-bold text-[17px] text-ink mb-3.5">You might also like</div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(similar ?? Array.from({ length: 4 })).map((item, index) =>
          item ? (
            <RestaurantCard key={item.objectID} restaurant={item} onSelect={onSelectRestaurant} />
          ) : (
            <div
              key={index}
              className="h-[260px] rounded-xl bg-chip animate-pulse"
              aria-hidden
            />
          )
        )}
      </div>
    </div>
  );
}
