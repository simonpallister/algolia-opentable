"use client";

import { useState } from "react";
import type { Restaurant } from "@/types/restaurant";
import { paymentLabels, reviewCountLabel, starString } from "@/lib/format";

/**
 * The design includes an illustrative "tag" badge (e.g. "Popular for
 * pasta", "Newly opened") on some cards. Nothing in the dataset supports
 * those specific claims (see DECISIONS.md / HANDOFF.md - no fabricated
 * signals), so it's dropped rather than invented per-card.
 */
export default function RestaurantCard({
  restaurant,
  onSelect,
}: {
  restaurant: Restaurant;
  onSelect: (restaurant: Restaurant) => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const payments = paymentLabels(restaurant.payment_options);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(restaurant)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect(restaurant);
      }}
      className="flex flex-col border border-border rounded-xl overflow-hidden h-full bg-white cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="relative h-[110px] sm:h-[170px] bg-chip flex items-center justify-center overflow-hidden">
        {!imageFailed && restaurant.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- external, unconfigured OpenTable CDN host
          <img
            src={restaurant.image_url}
            alt={restaurant.name}
            onError={() => setImageFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-xs text-muted font-mono">{restaurant.name}</span>
        )}
      </div>
      <div className="p-2.5 sm:p-4 flex flex-col gap-1 sm:gap-2 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="font-bold text-[13px] sm:text-base text-ink truncate">
            {restaurant.name}
          </div>
          <div className="font-bold text-xs sm:text-[13px] text-muted whitespace-nowrap">
            {restaurant.price_display}
          </div>
        </div>
        <div className="text-[11px] sm:text-[13px] text-muted-light truncate">
          {restaurant.food_type} &middot; {restaurant.neighborhood}
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5">
          <span className="text-gold text-xs sm:text-sm tracking-wide">
            {starString(restaurant.stars_count)}
          </span>
          <span className="text-[11px] sm:text-[13px] font-bold text-chip-fg">
            {restaurant.stars_count.toFixed(1)}
          </span>
          <span className="text-[10px] sm:text-xs text-muted">
            ({reviewCountLabel(restaurant.reviews_count)})
          </span>
        </div>
        <div className="hidden sm:block text-xs text-muted-light">{payments.join(" · ")}</div>
        <div className="flex-1" />
        <div className="flex justify-end mt-1">
          <a
            href={restaurant.reserve_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="text-[11px] sm:text-xs font-semibold text-brand border border-brand/40 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-full hover:bg-brand hover:text-white transition-colors"
          >
            Reserve
          </a>
        </div>
      </div>
    </div>
  );
}
