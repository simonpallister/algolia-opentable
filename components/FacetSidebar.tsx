"use client"

import { useEffect, useRef } from "react"
import {
  useCurrentRefinements,
  useRefinementList,
  useSearchBox,
  type UseRefinementListProps,
} from "react-instantsearch"
import { useDetectedArea } from "@/lib/geo"

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-bold uppercase tracking-wide text-muted mb-2">{children}</div>
}

/**
 * Facets directly on `price_display` (the real $/$$/$$$/$$$$ signage
 * already computed from the `price` tier at data-prep time - see
 * DECISIONS.md) rather than deriving signage from `price_range`. Only
 * $$/$$$/$$$$ exist in the data (no tier 1) - see DECISIONS.md.
 */
const PRICE_ORDER = ["$$", "$$$", "$$$$"]

function PriceFacet() {
  const { items, refine } = useRefinementList({ attribute: "price_display" })
  const sorted = [...items].sort((a, b) => PRICE_ORDER.indexOf(a.value) - PRICE_ORDER.indexOf(b.value))

  return (
    <div>
      <SectionLabel>Price</SectionLabel>
      <div className="flex gap-1.5">
        {sorted.map(item => (
          <button
            key={item.value}
            type="button"
            title={item.value}
            onClick={() => refine(item.value)}
            className={`text-sm font-bold px-3 py-1.5 rounded-lg transition-colors ${
              item.isRefined ? "bg-brand text-white" : "bg-chip text-chip-fg hover:bg-border"
            }`}>
            {item.value}
          </button>
        ))}
      </div>
    </div>
  )
}

type FacetItem = { value: string; label: string; count?: number; isRefined: boolean }

/**
 * `useRefinementList`'s `items` is a plain slice of the top N values by
 * count (confirmed in `connectRefinementList`'s source - no special
 * handling for values that are refined but fall outside that window).
 * A value can be genuinely refined (checked via `useCurrentRefinements`,
 * the source of truth) yet silently absent from `items` - same failure
 * mode already fixed once for the old single-select city dropdown (see
 * DECISIONS.md, "[UX] Geo-detected city applied as a real city
 * refinement"), latent here for every multi-select facet with a `limit`.
 * Most likely to bite a facet whose refined value isn't a top-N-by-count
 * one - exactly what geo-detection picks for `area` (a real location, not
 * necessarily one of the busiest). Synthesizes a visible entry (no count,
 * since it's not in the fetched window) for any refined value `items`
 * doesn't already contain, so a checked box never silently disappears.
 */
function withVisibleRefinements(items: FacetItem[], refinedValues: string[]): FacetItem[] {
  const visibleValues = new Set(items.map(item => item.value))
  const missing = refinedValues.filter(value => !visibleValues.has(value))
  if (missing.length === 0) return items
  const synthesized: FacetItem[] = missing.map(value => ({ value, label: value, isRefined: true }))
  return [...synthesized, ...items]
}

function CheckboxList({
  items,
  refine,
  labelFor,
}: {
  items: FacetItem[]
  refine: (value: string) => void
  labelFor?: (value: string) => string
}) {
  return (
    <div className="flex flex-col gap-2 text-sm text-chip-fg">
      {items.map(item => (
        <label key={item.value} className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={item.isRefined}
            onChange={() => refine(item.value)}
            className="accent-brand"
          />
          <span>
            {labelFor ? labelFor(item.value) : item.label}
            {item.count !== undefined ? ` (${item.count})` : ""}
          </span>
        </label>
      ))}
    </div>
  )
}

function CheckboxFacet({
  label,
  attribute,
  options,
  labelFor,
}: {
  label: string
  attribute: UseRefinementListProps["attribute"]
  options?: Partial<UseRefinementListProps>
  labelFor?: (value: string) => string
}) {
  const { items: currentRefinements } = useCurrentRefinements()
  const refinedValues =
    currentRefinements.find(r => r.attribute === attribute)?.refinements.map(r => String(r.value)) ?? []
  const { items, refine } = useRefinementList({ attribute, ...options })
  const visibleItems = withVisibleRefinements(items, refinedValues)
  if (visibleItems.length === 0) return null

  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <CheckboxList items={visibleItems} refine={refine} labelFor={labelFor} />
    </div>
  )
}

/**
 * A checkbox facet that only renders once a *different* attribute
 * (`gateAttribute`) already has an active refinement - progressive
 * disclosure for facets that are too granular to be useful as a flat list
 * until scoped (`food_type` under `cuisine_category`, `city` under `area`,
 * `neighborhood` under `city` - see DECISIONS.md for why each one needs
 * this). Counts are already scoped to the filtered result set natively by
 * Algolia, no extra query logic needed.
 */
function GatedCheckboxFacet({
  label,
  attribute,
  gateAttribute,
  options,
}: {
  label: string
  attribute: UseRefinementListProps["attribute"]
  gateAttribute: string
  options?: Partial<UseRefinementListProps>
}) {
  const { items: currentRefinements } = useCurrentRefinements()
  const isGateOpen = currentRefinements.some(r => r.attribute === gateAttribute)
  const refinedValues =
    currentRefinements.find(r => r.attribute === attribute)?.refinements.map(r => String(r.value)) ?? []
  const { items, refine, isShowingMore, toggleShowMore, canToggleShowMore } = useRefinementList({
    attribute,
    ...options,
  })
  const visibleItems = withVisibleRefinements(items, refinedValues)

  if (!isGateOpen) return null
  if (visibleItems.length === 0) return null

  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <CheckboxList items={visibleItems} refine={refine} />
      {canToggleShowMore && (
        <button
          type="button"
          onClick={() => toggleShowMore()}
          className="text-brand text-xs font-bold mt-2 hover:text-brand-hover">
          {isShowingMore ? "Show less" : "+ more"}
        </button>
      )}
    </div>
  )
}

/**
 * Area, the top-level geographic facet (51 clean metro/region values - see
 * DECISIONS.md, "[UX] Area/city/neighborhood as facets, not a single-select
 * location picker"). Multi-select, like every other facet here - this
 * replaced an earlier single-select city dropdown pill in the header.
 *
 * Also owns the geolocation auto-apply behavior that pill used to own: once
 * Algolia resolves a location for this visitor - browser geolocation
 * (granted) or its own IP guess (fallback), either one, via `lib/geo.ts`'s
 * `useDetectedArea` - the nearest `area` gets checked automatically, exactly
 * once, and only if the user hasn't already picked an area or started
 * typing a search. If the user then starts typing, that auto-applied area
 * clears itself - an assumption they never consciously made shouldn't
 * silently scope their search - but a manually-checked area is left alone
 * under the same typed query, same reasoning as the geo-detected-city
 * version this replaced (see DECISIONS.md, "[UX] Geo-detected city vs.
 * free-text search").
 *
 * **Default fallback (see DECISIONS.md, "[UX] Default area fallback when
 * detection is out of range"):** if a real coordinate was resolved
 * (`hasCoordinate`) but it's too far from every dataset area to match one
 * (`detectedArea` still `undefined` - e.g. a visitor genuinely outside
 * this US-only dataset's coverage), auto-apply the single most popular
 * area instead of leaving the whole catalog unfiltered - `items[0]`, the
 * top-count entry in this same widget's own already-fetched list (its
 * default sort is count-descending, see the comment below). This is a
 * starting point, not a claim - the resulting pill reads exactly like any
 * manually-picked area, never "detected near you," so nothing dishonest
 * is asserted about a visitor's real location.
 *
 * `autoAppliedRef`/`autoAppliedAreaRef` are scoped to this component
 * instance, which is remounted if the viewport crosses the desktop/mobile
 * breakpoint (`FacetSidebar` swaps between the sidebar and the mobile
 * filter sheet). Edge case, low stakes: resize across that breakpoint
 * right after manually clearing an auto-applied area, and it can get
 * re-suggested once. Not worth the complexity of hoisting this state
 * somewhere breakpoint-independent for that.
 */
function AreaFacet({ detectedArea, hasCoordinate }: { detectedArea?: string; hasCoordinate: boolean }) {
  const { query } = useSearchBox()
  // Count-descending (Algolia's default sort, same as every other facet
  // in this sidebar) rather than alphabetical - with 51 values and no
  // gate above it to naturally scope which ones matter, an alphabetical
  // list put unrelated, sparse areas (e.g. "Cleveland / Akron / Canton")
  // on equal visual footing with the ones that actually have a meaningful
  // number of restaurants. `limit`/`showMore` matches the same "top N,
  // expand for the rest" pattern used for City/Neighborhood/Cuisine type
  // below, instead of dumping all 51 checkboxes on screen at once.
  const { items, refine, isShowingMore, toggleShowMore, canToggleShowMore } = useRefinementList({
    attribute: "area",
    limit: 10,
    showMore: true,
    showMoreLimit: 51,
  })
  // Source of truth for what's actually refined, independent of whether
  // it's in the count-windowed `items` above - see `withVisibleRefinements`.
  const { items: currentRefinements } = useCurrentRefinements()
  const refinedAreaValues =
    currentRefinements.find(r => r.attribute === "area")?.refinements.map(r => String(r.value)) ?? []
  const visibleItems = withVisibleRefinements(items, refinedAreaValues)
  const hasAnyAreaRefined = refinedAreaValues.length > 0

  const autoAppliedRef = useRef(false)
  const autoAppliedAreaRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (autoAppliedRef.current || !hasCoordinate) return
    const fallbackArea = items[0]?.value
    // A real coordinate resolved but matched no area (out of range) and
    // the fallback candidate (most-popular area) needs the facet's own
    // counts to have loaded first - wait rather than lock in a "nothing to
    // apply" decision before that data exists.
    if (!detectedArea && !fallbackArea && items.length === 0) return
    autoAppliedRef.current = true
    const areaToApply = detectedArea ?? fallbackArea
    if (areaToApply && !hasAnyAreaRefined && !query.trim()) {
      refine(areaToApply)
      autoAppliedAreaRef.current = areaToApply
    }
  }, [hasCoordinate, detectedArea, items, hasAnyAreaRefined, query, refine])

  useEffect(() => {
    if (!query.trim()) return
    if (autoAppliedAreaRef.current) {
      refine(autoAppliedAreaRef.current)
      autoAppliedAreaRef.current = undefined
    }
  }, [query, refine])

  // Once an area is refined, `LocationBreadcrumb` is already showing and
  // controlling it as a removable pill - showing the full 51-checkbox list
  // here too is redundant clutter, not a second way to do the same thing.
  // Hides only the *rendered* checkboxes, not the `useRefinementList` call
  // above - keeping the widget itself mounted regardless of this branch is
  // exactly what "[Bug] Closing the mobile filter sheet silently cleared
  // every active filter" in DECISIONS.md warns against undoing (unmounting
  // a `useRefinementList` widget disposes its refinement). To pick a
  // *different* area, remove the current one via its breadcrumb pill first
  // - same as how removing City is required before a fresh Neighborhood
  // pick becomes visible again in the gated facets below.
  if (hasAnyAreaRefined) return null
  if (visibleItems.length === 0) return null

  return (
    <div>
      <SectionLabel>Area</SectionLabel>
      <CheckboxList
        items={visibleItems}
        refine={value => {
          autoAppliedAreaRef.current = undefined
          refine(value)
        }}
      />
      {canToggleShowMore && (
        <button
          type="button"
          onClick={() => toggleShowMore()}
          className="text-brand text-xs font-bold mt-2 hover:text-brand-hover">
          {isShowingMore ? "Show less" : "+ more"}
        </button>
      )}
    </div>
  )
}

const PAYMENT_LABELS: Record<string, string> = {
  AMEX: "Amex",
  Visa: "Visa",
  Discover: "Discover",
  MasterCard: "Mastercard",
}

export default function FacetSidebar({ aroundLatLng }: { aroundLatLng?: string }) {
  const { area: detectedArea, hasCoordinate } = useDetectedArea(aroundLatLng)
  return (
    <div className="flex flex-col gap-6">
      <AreaFacet detectedArea={detectedArea} hasCoordinate={hasCoordinate} />
      <GatedCheckboxFacet
        label="City"
        attribute="city"
        gateAttribute="area"
        options={{ limit: 8, showMore: true, showMoreLimit: 60 }}
      />
      <GatedCheckboxFacet
        label="Neighborhood"
        attribute="neighborhood"
        gateAttribute="city"
        options={{ limit: 8, showMore: true, showMoreLimit: 60 }}
      />
      <CheckboxFacet label="Cuisine" attribute="cuisine_category" options={{ limit: 13, sortBy: ["name:asc"] }} />
      <GatedCheckboxFacet
        label="Cuisine type"
        attribute="food_type"
        gateAttribute="cuisine_category"
        options={{ limit: 6, showMore: true, showMoreLimit: 120 }}
      />
      <PriceFacet />
      <CheckboxFacet label="Payment" attribute="payment_options" labelFor={value => PAYMENT_LABELS[value] ?? value} />
      <CheckboxFacet label="Dining style" attribute="dining_style" options={{ limit: 6, showMore: true }} />
    </div>
  )
}
