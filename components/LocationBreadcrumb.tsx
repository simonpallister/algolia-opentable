"use client";

import { useCurrentRefinements } from "react-instantsearch";
import type { CurrentRefinementsConnectorParamsRefinement } from "instantsearch.js/es/connectors/current-refinements/connectCurrentRefinements";

/**
 * Removable breadcrumb for the Area -> City -> Neighborhood facet hierarchy
 * (see DECISIONS.md, "[UX] Area/city/neighborhood as facets, not a
 * single-select location picker"). Renders nothing until at least one of
 * the three is refined - which now happens on page load in the common case,
 * since `lib/geo.ts`'s `useDetectedArea` auto-checks an area for both the
 * browser-geolocation and IP-fallback paths (see `FacetSidebar.tsx`'s
 * `AreaFacet`). Because that auto-detection effectively pins the visitor
 * into an area, this breadcrumb is also their way *out* of it - removing
 * the Area pill clears it and widens the search back to everywhere.
 *
 * Location-only by design: cuisine/price/dining-style stay removable in
 * `FacetSidebar`, not duplicated here.
 *
 * `useCurrentRefinements` groups its `items` by attribute, not by value -
 * see `CLAUDE.md`'s note on this hook, a repeat source of bugs in this
 * codebase. `groups` below is indexed to match `LEVEL_ATTRIBUTES` (Area,
 * City, Neighborhood in that fixed order) rather than whatever order the
 * hook itself returns.
 *
 * Cascade removal: clearing a level also clears every refinement at the
 * levels below it. Without this, removing e.g. the Area pill while a City
 * is still checked would leave that City refinement silently narrowing
 * results even though `FacetSidebar`'s `GatedCheckboxFacet` has already
 * hidden the City facet (its gate, `area`, is no longer refined) - an
 * invisible filter with no visible control left to remove it.
 */

const LEVEL_ATTRIBUTES = ["area", "city", "neighborhood"] as const;

export default function LocationBreadcrumb() {
  const { items, refine } = useCurrentRefinements({
    includedAttributes: [...LEVEL_ATTRIBUTES],
  });

  const groups = LEVEL_ATTRIBUTES.map((attribute) =>
    items.find((item) => item.attribute === attribute)
  );
  const visibleLevels = groups
    .map((group, levelIndex) => ({ group, levelIndex }))
    .filter(({ group }) => (group?.refinements.length ?? 0) > 0);

  if (visibleLevels.length === 0) return null;

  const removeCascading = (
    refinement: CurrentRefinementsConnectorParamsRefinement,
    levelIndex: number
  ) => {
    refine(refinement);
    for (let i = levelIndex + 1; i < groups.length; i++) {
      groups[i]?.refinements.forEach((descendant) => refine(descendant));
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap mb-4 text-sm">
      <span className="text-muted">&#128205;</span>
      {visibleLevels.map(({ group, levelIndex }, index) => (
        <div key={group!.attribute} className="flex items-center gap-1.5 flex-wrap">
          {index > 0 && <span className="text-muted">&#8250;</span>}
          {group!.refinements.map((refinement) => (
            <button
              key={String(refinement.value)}
              type="button"
              onClick={() => removeCascading(refinement, levelIndex)}
              aria-label={`Remove ${refinement.label} filter`}
              className="flex items-center gap-1.5 bg-brand text-white text-xs font-bold pl-3 pr-2.5 py-1.5 rounded-full hover:bg-brand-hover transition-colors"
            >
              {refinement.label}
              <span aria-hidden="true">&#10005;</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
