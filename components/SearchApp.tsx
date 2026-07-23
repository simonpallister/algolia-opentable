"use client";

import { useState } from "react";
import { InstantSearch, Configure } from "react-instantsearch";
import { searchClient, ALGOLIA_INDEX_NAME } from "@/lib/algolia";
import { useGeoParams } from "@/lib/geo";
import { useMediaQuery } from "@/lib/useMediaQuery";
import type { Restaurant } from "@/types/restaurant";
import SearchHeader from "./SearchHeader";
import LocationBreadcrumb from "./LocationBreadcrumb";
import FacetSidebar from "./FacetSidebar";
import ResultsGrid from "./ResultsGrid";
import ResultsMap from "./ResultsMap";
import RestaurantModal from "./RestaurantModal";

/**
 * The mobile filter sheet, in its own component so `FacetSidebar` (and
 * every `useRefinementList`-backed facet inside it, including `AreaFacet`'s
 * auto-detect effect) stays mounted for the app's lifetime on mobile,
 * exactly like the always-mounted desktop `<aside>` - open/close is purely
 * a CSS state (`open`), never a conditional unmount.
 *
 * Why this matters (found via manual testing, not theoretical): this used
 * to be `{filtersOpen && (<div>...<FacetSidebar/>...</div>)}` - closing the
 * sheet unmounted `FacetSidebar` entirely. `react-instantsearch`'s
 * `useRefinementList` (`connectRefinementList`'s `dispose()`, see
 * `node_modules/instantsearch.js/es/connectors/refinement-list/
 * connectRefinementList.js`) calls `removeFacet`/`removeDisjunctiveFacet`
 * on unmount - so every checked box across every facet (not just the new
 * Area/City/Neighborhood breadcrumb this was found while testing) was
 * silently cleared the instant the sheet closed, confirmed live: check
 * Cuisine -> American, close via either the X or "Show results", reopen -
 * unchecked, count back to the full unfiltered set. This is exactly the
 * failure mode DECISIONS.md's "[Bug] The search box silently reset..."
 * entry already named as a real risk for exactly this component
 * ("connector hooks... should be called from components that are mounted
 * once, for the app's lifetime") but hadn't yet confirmed as happening.
 *
 * Kept as a *visual* overlay/backdrop toggle (`opacity`/`translate-y`/
 * `pointer-events`) rather than `display:none`, so the slide-up motion
 * still animates in both directions.
 */
function MobileFilterSheet({
  open,
  onClose,
  aroundLatLng,
}: {
  open: boolean;
  onClose: () => void;
  aroundLatLng?: string;
}) {
  return (
    <div
      className={`fixed inset-0 z-40 bg-black/40 flex items-end transition-opacity ${
        open ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      onClick={onClose}
      aria-hidden={!open}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={`bg-white w-full max-h-[80vh] overflow-y-auto rounded-t-2xl p-5 transition-transform ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="w-9 h-1 bg-border-strong rounded-full mx-auto mb-4" />
        <div className="flex justify-between items-center mb-4">
          <div className="font-bold text-ink text-sm">Filters</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="text-muted"
          >
            &#10005;
          </button>
        </div>
        <FacetSidebar aroundLatLng={aroundLatLng} />
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-5 bg-brand text-white text-sm font-bold py-3 rounded-full"
        >
          Show results
        </button>
      </div>
    </div>
  );
}

export default function SearchApp() {
  const geo = useGeoParams();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [focused, setFocused] = useState<Restaurant | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <InstantSearch searchClient={searchClient} indexName={ALGOLIA_INDEX_NAME}>
      <Configure
        hitsPerPage={20}
        aroundLatLng={geo.aroundLatLng}
        aroundLatLngViaIP={geo.aroundLatLngViaIP}
        aroundRadius="all"
      />

      <div className="min-h-screen pb-16">
        <div className="max-w-[1440px] mx-auto p-4 sm:p-6">
          <SearchHeader />
          <LocationBreadcrumb />

          {isDesktop ? (
            <div className="flex gap-6 items-start">
              <aside className="w-60 flex-shrink-0 bg-white border border-border rounded-2xl p-5 sticky top-6">
                <FacetSidebar aroundLatLng={geo.aroundLatLng} />
              </aside>
              <ResultsGrid onSelectRestaurant={setFocused} />
              <div className="w-[360px] flex-shrink-0 sticky top-6 h-[640px] rounded-2xl overflow-hidden border border-border">
                <ResultsMap fallbackCenter={geo.coords} onSelectRestaurant={setFocused} />
              </div>
            </div>
          ) : (
            <div>
              <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
                <button
                  type="button"
                  onClick={() => setFiltersOpen(true)}
                  className="flex-shrink-0 bg-brand text-white text-xs font-bold px-3.5 py-2 rounded-full whitespace-nowrap"
                >
                  &#9776; Filters
                </button>
                <button
                  type="button"
                  onClick={() => setMobileView((v) => (v === "list" ? "map" : "list"))}
                  className="flex-shrink-0 bg-chip text-chip-fg text-xs font-bold px-3.5 py-2 rounded-full whitespace-nowrap"
                >
                  {mobileView === "list" ? "\u{1F5FA}️ Map" : "☰ List"}
                </button>
              </div>

              {mobileView === "list" ? (
                <ResultsGrid onSelectRestaurant={setFocused} />
              ) : (
                <div className="h-[70vh] rounded-2xl overflow-hidden border border-border">
                  <ResultsMap fallbackCenter={geo.coords} onSelectRestaurant={setFocused} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Only mounted in mobile mode - see MobileFilterSheet's own comment
          for why it must stay mounted for `!isDesktop`'s whole lifetime
          rather than remounting on every open/close. Guarding on `isDesktop`
          instead is the same already-accepted, rare (viewport-resize-only)
          remount trade-off `AreaFacet` documents for its own auto-apply
          ref state - not the frequent every-open/close unmount this
          replaced. */}
      {!isDesktop && (
        <MobileFilterSheet
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          aroundLatLng={geo.aroundLatLng}
        />
      )}

      <RestaurantModal
        restaurant={focused}
        onClose={() => setFocused(null)}
        onSelectRestaurant={setFocused}
      />
    </InstantSearch>
  );
}
