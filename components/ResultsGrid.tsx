"use client";

import { useEffect, useState } from "react";
import { useCurrentRefinements, useInfiniteHits, useSearchBox } from "react-instantsearch";
import type { Restaurant } from "@/types/restaurant";
import { MIN_QUERY_LENGTH_FOR_RESULTS } from "@/lib/searchConfig";
import RestaurantCard from "./RestaurantCard";
import EmptyState from "./EmptyState";

export default function ResultsGrid({
  onSelectRestaurant,
}: {
  onSelectRestaurant: (restaurant: Restaurant) => void;
}) {
  const { hits, results, isLastPage, showMore } = useInfiniteHits<Restaurant>();
  const { query, clear: clearQuery } = useSearchBox();
  // Grouped by attribute: the group's own `.label` is the attribute's
  // display name ("city"), the selected values' labels live one level
  // down in `.refinements[].label` ("New York"). `city` is multi-select
  // (see DECISIONS.md, "[UX] Area/city/neighborhood as facets, not a
  // single-select location picker"), so this can be more than one value.
  const { items: refinementGroups } = useCurrentRefinements();
  const cityValueLabels =
    refinementGroups.find((group) => group.attribute === "city")?.refinements.map((r) => r.label) ??
    [];

  const trimmedQueryLength = query.trim().length;
  const queryTooShort =
    trimmedQueryLength > 0 && trimmedQueryLength < MIN_QUERY_LENGTH_FOR_RESULTS;

  // Below the minimum query length, the actual search still runs (see
  // `SearchHeader.tsx` - the input stays bound directly to `useSearchBox`'s
  // own `query`, on purpose), but its results are noisy ("n" alone matches
  // thousands of records) and not worth showing. Rather than blanking the
  // grid to a placeholder while that noisy fetch is live, keep displaying
  // whatever was on screen before - the last hit set from when the query
  // was empty or 3+ characters - until it's long enough again.
  const [frozen, setFrozen] = useState({ hits, nbHits: results?.nbHits ?? 0, isLastPage });
  useEffect(() => {
    if (!queryTooShort) {
      setFrozen({ hits, nbHits: results?.nbHits ?? 0, isLastPage });
    }
  }, [queryTooShort, hits, results, isLastPage]);

  const displayHits = queryTooShort ? frozen.hits : hits;
  const displayNbHits = queryTooShort ? frozen.nbHits : results?.nbHits ?? 0;
  const displayIsLastPage = queryTooShort ? frozen.isLastPage : isLastPage;

  const cityLabelSuffix =
    cityValueLabels.length === 0
      ? ""
      : cityValueLabels.length <= 2
      ? ` in ${cityValueLabels.join(" and ")}`
      : ` in ${cityValueLabels.length} cities`;
  const countLabel = `${displayNbHits.toLocaleString()} restaurants${cityLabelSuffix}`;

  return (
    <main className="flex-1 grid grid-cols-2 gap-3 sm:gap-5 content-start">
      <div className="col-span-full text-[13px] text-muted">{countLabel}</div>

      {displayNbHits === 0 ? (
        <EmptyState query={query} onClearQuery={clearQuery} />
      ) : (
        <>
          {displayHits.map((hit) => (
            <RestaurantCard key={hit.objectID} restaurant={hit} onSelect={onSelectRestaurant} />
          ))}
          {!displayIsLastPage && (
            <div className="col-span-full flex justify-center py-4">
              <button
                type="button"
                onClick={() => showMore()}
                className="text-sm font-semibold text-brand border border-brand/40 px-5 py-2.5 rounded-full hover:bg-brand hover:text-white transition-colors"
              >
                Load more
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
