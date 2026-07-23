"use client";

import { useEffect } from "react";
import type { Restaurant } from "@/types/restaurant";
import { paymentLabels, reviewCountLabel, starString } from "@/lib/format";
import SimilarRestaurants from "./SimilarRestaurants";

/**
 * The restaurant focus view: a modal/drawer over the search results, not a
 * routed detail page (see DECISIONS.md, "[UX] Restaurant focus view:
 * modal/drawer, not a full detail page") - keeps search/map/facet state
 * intact behind it. The dataset has no free-text description field, so
 * this shows real structured fields (address, phone, dining style) rather
 * than the design's placeholder blurb copy.
 */
export default function RestaurantModal({
  restaurant,
  onClose,
  onSelectRestaurant,
}: {
  restaurant: Restaurant | null;
  onClose: () => void;
  onSelectRestaurant: (restaurant: Restaurant) => void;
}) {
  useEffect(() => {
    if (!restaurant) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [restaurant, onClose]);

  if (!restaurant) return null;

  const payments = paymentLabels(restaurant.payment_options);
  const chips = [restaurant.dining_style, ...payments];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={restaurant.name}
        onClick={(event) => event.stopPropagation()}
        className="bg-page w-full sm:max-w-3xl max-h-[92vh] sm:max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
      >
        <div className="relative h-56 sm:h-72 bg-chip flex items-end">
          <img
            src={restaurant.image_url}
            alt={restaurant.name}
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-white/90 text-ink font-bold flex items-center justify-center hover:bg-white"
          >
            &#10005;
          </button>
        </div>

        <div className="p-6">
          <div className="flex flex-col sm:flex-row gap-8">
            <div className="flex-1">
              <div className="font-extrabold text-2xl sm:text-3xl text-ink mb-1.5">
                {restaurant.name}
              </div>
              <div className="text-[15px] text-muted mb-2.5">
                {restaurant.food_type} &middot; {restaurant.neighborhood},{" "}
                {restaurant.city} &middot; {restaurant.price_display}
              </div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-gold text-lg tracking-wide">
                  {starString(restaurant.stars_count)}
                </span>
                <span className="text-[15px] font-bold text-chip-fg">
                  {restaurant.stars_count.toFixed(1)}
                </span>
                <span className="text-[13px] text-muted">
                  ({reviewCountLabel(restaurant.reviews_count)})
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mb-5">
                {chips.map((chip) => (
                  <span
                    key={chip}
                    className="bg-chip text-chip-fg text-xs font-semibold px-3 py-1.5 rounded-full"
                  >
                    {chip}
                  </span>
                ))}
              </div>
              <div className="text-sm text-muted leading-relaxed max-w-lg">
                {restaurant.address}, {restaurant.city}, {restaurant.state}{" "}
                {restaurant.postal_code}
                <br />
                {restaurant.phone}
              </div>
            </div>
            <div className="sm:w-56 flex-shrink-0 flex flex-col gap-3">
              <a
                href={restaurant.reserve_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-center bg-brand text-white text-sm font-bold py-3.5 rounded-xl hover:bg-brand-hover transition-colors"
              >
                Reserve on OpenTable
              </a>
              <div className="text-xs text-muted text-center">
                Availability handled by OpenTable at handoff
              </div>
            </div>
          </div>

          <SimilarRestaurants restaurant={restaurant} onSelectRestaurant={onSelectRestaurant} />
        </div>
      </div>
    </div>
  );
}
