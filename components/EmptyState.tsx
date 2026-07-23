"use client";

import { useClearRefinements, useCurrentRefinements } from "react-instantsearch";

/**
 * No-results is framed as a recovery path, not a dead end (see
 * DESIGN_PROMPT.md: "never just 'no results found'"). Recovery actions are
 * generated from whatever refinements/search query are actually active,
 * rather than hard-coded suggestions, so they always offer a real way out.
 *
 * `query`/`onClearQuery` are passed down from `ResultsGrid` rather than
 * calling `useSearchBox()` here directly - this component only mounts when
 * `nbHits === 0`, and every call to a react-instantsearch connector hook
 * registers a *new* widget instance on mount. A SearchBox widget's
 * `getWidgetSearchParameters` re-derives the shared helper's `query` from a
 * freshly rebuilt UI-state snapshot the moment it first registers; reading
 * a stale snapshot there was silently resetting the *entire* app's query
 * back to "" the instant a search first crossed into zero results -
 * confirmed by reproducing it with "new yrk": "new yr" (the state one
 * keystroke before typo-tolerance recovers it back to real hits) is a
 * genuine 0-hit query, and that's exactly when this fired. `useCurrentRefinements`/
 * `useClearRefinements` don't implement `getWidgetSearchParameters`, so
 * they don't have this failure mode and are left as direct hook calls here.
 */
export default function EmptyState({
  query,
  onClearQuery,
}: {
  query: string;
  onClearQuery: () => void;
}) {
  // Grouped by attribute: each group carries its own list of active
  // refinement values and a `refine(refinement)` to remove just one.
  const { items: refinementGroups } = useCurrentRefinements();
  const { refine: clearAll, canRefine: canClearAll } = useClearRefinements();

  const refinementCount = refinementGroups.reduce(
    (sum, group) => sum + group.refinements.length,
    0
  );
  const hasRecovery = Boolean(query) || refinementCount > 0;

  return (
    <div className="col-span-full flex flex-col items-center text-center px-6 py-20 bg-white border border-border rounded-2xl">
      <div className="text-5xl mb-2">&#127860;</div>
      <div className="font-bold text-xl text-ink mb-2">No restaurants match right now</div>
      <div className="text-sm text-muted max-w-md mb-5">
        {hasRecovery
          ? "That combination is rare. Try loosening a filter or broadening your search."
          : "Try a different search, or a different city."}
      </div>
      <div className="flex gap-2.5 flex-wrap justify-center">
        {query && (
          <button
            type="button"
            onClick={() => onClearQuery()}
            className="bg-chip text-chip-fg text-[13px] font-semibold px-4 py-2.5 rounded-full hover:bg-border"
          >
            Clear search “{query}”
          </button>
        )}
        {refinementGroups.flatMap((group) =>
          group.refinements.map((refinement) => (
            <button
              key={`${group.attribute}:${refinement.value}`}
              type="button"
              onClick={() => group.refine(refinement)}
              className="bg-chip text-chip-fg text-[13px] font-semibold px-4 py-2.5 rounded-full hover:bg-border"
            >
              Remove {refinement.label}
            </button>
          ))
        )}
        {canClearAll && refinementCount > 1 && (
          <button
            type="button"
            onClick={() => clearAll()}
            className="bg-brand text-white text-[13px] font-bold px-4 py-2.5 rounded-full hover:bg-brand-hover"
          >
            Clear all filters
          </button>
        )}
      </div>
    </div>
  );
}
