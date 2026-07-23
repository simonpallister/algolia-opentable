# Data & Design Decisions

A running log of assumptions, deliberate design choices, and the reasoning
behind them. Kept separate from code comments so it can be read end-to-end
before the technical debrief, and updated as the project moves from data
prep into index configuration, UX, and relevance tuning.

Each entry: **what** was decided, **why**, and **what the alternative was**.

---

## Data join

**What:** Joined `restaurants_list.json` (5,000 records) to
`restaurants_info.csv` (5,000 rows) on `objectID`, cast to `Number` for the
join and back to `String` for the Algolia `objectID` field.

**Why:** Algolia requires string `objectID`s. The two source files store the
same key as different types (JSON: number, CSV: string), so a naive
`===` join would silently fail to match anything.

**Verification:** All 5,000 JSON records found a matching CSV row (0 missing
joins). The script throws if this stops being true rather than indexing
partial records, so a future data refresh can't silently degrade the index.

---

## Payment options normalisation

**What:** The brief specifies exactly one rule: expose only AMEX, Visa,
Discover, and MasterCard, with Diners Club and Carte Blanche folded into
Discover. The raw data also contains "Cash Only," "Pay with OpenTable," and
"JCB," none of which the brief mentions.

**Decision:** Those three unmentioned values are dropped from the
customer-facing `payment_options` facet field, since none map to a card in
the allowed list. Nothing is silently lost, the original list is preserved
in `payment_options_raw` for reference.

**Why this matters:** One restaurant ("Mexican Festival Restaurant") only
accepts Cash Only, so after normalisation it has an *empty*
`payment_options` array. That's a real edge case for the front-end to
handle deliberately (e.g. hide the payment filter row for that record,
or show "Cash only" as a separate, non-card indicator), rather than
something to discover by accident during the demo.

**Alternative considered:** Silently drop the whole payment_options concept
for records that don't cleanly map. Rejected, since payment method is a
named requirement and hiding the edge case would look like an oversight
if surfaced live in the mock customer call.

---

## Price vs. price_range discrepancy

**What:** The JSON `price` field (2-4, OpenTable's dollar-sign tier) and the
CSV `price_range` field (a text bucket) are correlated but not identical.
Checked across all 5,000 records:

| price tier | "\$30 and under" | "\$31 to \$50" | "\$50 and over" |
|---|---|---|---|
| 2 | 3,053 (expected) | 100 | 6 |
| 3 | 70 | 1,450 (expected) | 25 |
| 4 | 2 | 17 | 277 (expected) |

220 records (4.4%) land in a `price_range` bucket that doesn't match the
tier you'd predict from `price`. There's also no tier "1" anywhere in the
data, despite OpenTable's real scale running 1-4.

**Decision:** Keep both fields rather than picking one. `price_range` is
used as the customer-facing facet since it's plain English and immediately
understandable; `price` (plus the derived `price_display`, see below) stays
available for ranking, sorting, or a compact \$/\$\$/\$\$\$/\$\$\$\$ UI treatment.

**Why:** Neither field is "wrong," they're most likely two different
signals (self-reported tier vs. something closer to average-check-derived
bucket) from different systems that mostly, but not always, agree. Picking
one and discarding the other would be an unexplainable data loss if a
grader cross-checked the raw files. This is exactly the kind of
discrepancy I'd flag to a real customer rather than resolve unilaterally.

**Reversed 2026-07-22:** The Price facet (`FacetSidebar.tsx`) now filters
on `price_display` instead of `price_range`, faceted directly rather than
via a hand-rolled `price_range` -> \$ signage lookup table. The lookup
table had assigned its own signage per `price_range` bucket, duplicating
a figure that already exists as `price_display` - and, per the table
above, doing so *disagreed* with the real `price_display` for any
restaurant in that 4.4% mismatch band (e.g. a "\$50 and over" restaurant
whose actual `price_display` is `$$$` would show the "\$50 and over" chip
as `$$$$`, or vice versa). Faceting on `price_display` directly removes
that discrepancy for the compact-signage UI this always intended to be.
`price_range` is still pushed and faceted (`attributesForFaceting` in
`push-to-algolia.js`) since `SimilarRestaurants.tsx` filters on it for
cross-sell matching - only the customer-facing Price chips moved.

## Enrichments added at data-prep stage

Both are pure formatting/derivation with no relevance or ranking judgment
involved, so these were added directly rather than held for discussion:

- **`state_name`**: full US state name derived from the 2-letter code
  (e.g. `CO` → `Colorado`), for display purposes only.
- **`price_display`**: numeric `price` tier rendered as conventional
  \$/\$\$/\$\$\$/\$\$\$\$ signage, shown alongside `price_range` rather than
  replacing it.

---

## Enrichments considered, deferred to index-configuration / relevance stage

These would meaningfully improve the discovery experience but involve real
design judgment (how to weight, group, or infer something not explicitly
in the data), so they're being decided jointly rather than baked in
silently during data prep:

- ~~**Cuisine grouping.**~~ Implemented - see "[UX] Cuisine grouping:
  `cuisine_category`" below.

- **Rating confidence / weighted popularity score.** Checked: 12
  restaurants sit at a perfect 5.0 with 2-5 reviews (e.g. "Abruzzi
  Trattoria," 5.0 from 3 reviews). Naive `customRanking` on `stars_count`
  alone would rank these above a 4.6-star restaurant with 2,000 reviews,
  the classic vanity-metric problem, and would be an easy thing for a
  technical interviewer to poke at live. A confidence-adjusted score (e.g.
  Bayesian average, or a minimum-review floor) is the fix, but the exact
  formula is a ranking design decision, not a data fact.

- **Occasion/context tags** (e.g. "date night," "family-friendly") inferred
  from combinations of `dining_style`, `price_range`, and `food_type`.
  Potentially strong for the open-ended discovery persona, but heuristic
  and easy to overreach into inventing signal that isn't really there.
  Holding this until we've decided how much editorializing is appropriate
  for a customer demo.

---

## Geography fields: what each one is actually for

Checked before assuming these were redundant:

- **`neighborhood`**: genuinely a sub-city area in larger metros (e.g.
  Houston → "Midtown / Montrose," "Galleria / Uptown"; New York → "Upper
  East Side," "Midtown West"). In smaller markets it just duplicates
  `city` (2,491 of 5,000 records). Still worth keeping as a facet, it's
  meaningful wherever there's enough density for it to matter.
- **`area`**: a broader metro/region grouping (51 distinct values, e.g.
  "New York / Tri-State Area," "Denver / Colorado"). Good candidate for the
  top-level geo-browse facet and as the fallback when the browser doesn't
  grant geolocation.
- **`_geoloc`**: present and clean on every record, used for live
  distance-based ranking when geolocation is available.

---

## Scope boundary: search & discovery, not booking/availability

**What:** The demo does not include a date/time/party-size ("pax") booking
widget, even though that's the centrepiece of OpenTable's real product and
of most people's mental model of the brand.

**Why:** Neither source file contains any availability, time-slot, or
table-inventory data, only static restaurant attributes. A date/time/pax
picker with nothing real behind it would be a decorative fake, not a
capability. It would also misrepresent what's being sold: Algolia is a
search & discovery layer, not a reservations/inventory system. Real
OpenTable's own booking engine is a separate product outside this scope.

**Where the line sits:** `reserve_url` / `mobile_reserve_url` are the
natural handoff point, the demo's job is to get the right restaurant in
front of the right user and hand off to "Reserve," not to simulate the
reservation flow itself.

**Note on the provided mock-up:** it also stops at cuisine/rating/payment
filtering, no booking widget, despite representing a company whose real
site leads with one. Read as a signal that the exercise is deliberately
scoped to search/discovery, not a request to reproduce OpenTable's actual
product.

**Alternative considered:** Build the date/time/pax UI for visual fidelity
to the real OpenTable brand. Rejected: it doesn't test anything Algolia
does, adds scope for no relevance/search value, and risks reading as
over-engineering (a named rubric criterion) rather than a considered
choice.

---

## [UX] Map view, both personas, Leaflet + OpenStreetMap

**What:** Adding a map alongside the results list in both the known-item
search and open-ended discovery experiences, showing the current result
set as pins. Built with Leaflet (`react-leaflet`) rendering OpenStreetMap
tiles.

**Why a map at all:** location is one of the primary drivers of restaurant
choice alongside cuisine, price, and rating, but the provided mock-up has
no spatial component at all. This is a "go beyond what was asked" addition
directly tied to a named business goal (increase usage / conversion), not
decoration.

**Why Leaflet over Mapbox GL:** no API key or account signup required,
keeps the demo trivial to run for graders, and is a well-supported React
wrapper (`react-leaflet`). Mapbox would look marginally more polished but
adds an external dependency for no functional gain in a hiring-assignment
context. Revisit if visual fidelity becomes a real complaint.

**Location fallback hierarchy** (three native layers, nothing custom-built):

1. Browser geolocation granted → `aroundLatLng` with the real coordinates.
2. Not granted → Algolia's native `aroundLatLngViaIP` parameter, which
   geolocates the request server-side by IP. This is the same mechanism
   the real OpenTable site appears to use, and it's a built-in Algolia
   capability, not something we're engineering ourselves.
3. User types a place name into the search box (e.g. "sushi in
   Brooklyn") → handled by ordinary text relevance, since city/area/
   neighborhood are already searchable attributes. Deliberately not
   building a custom "detect location in query" parser, Algolia's text
   matching already does this for free, and adding a parser on top would
   be unnecessary complexity for no gain.

**Note:** the map is additive UI, not a replacement for the text search
box the brief specifically asks for ("a search interface that lets users
find restaurants through text search"). It visualises whichever result
set the text search + facets + geo-ranking already produced.

---

## [Relevance] Searchable attributes

**What:** Prioritised groups: `name` (highest), `food_type`, then
`city`/`area`/`neighborhood` together, then `address` as a lower-priority
group beneath those.

**Why address is included, initially left out:** first pass excluded it
as noise (nobody searches restaurants by street address). Reconsidered:
"that place on Main Street" or a half-remembered street name is a
genuine known-item recall pattern. Keeping it low-priority means a strong
name match still wins outright, but a street match becomes useful once
name search comes up empty.

**Why `city,area,neighborhood` is one comma-joined string, not three
separate array entries:** this is Algolia's actual syntax for saying
"equal priority, no ranking between them," as opposed to three separate
array elements, which would create three distinct priority tiers (city
ranked above area, area above neighborhood, etc). City, area, and
neighborhood are different granularities of the same concept, there's no
principled reason a neighborhood match should outrank a city match or
vice versa, so they're deliberately siblings within one tier, below
`food_type` and above `address`.

**Gap found and fixed 2026-07-23: state wasn't searchable at all.**
Queries combining a US state with a cuisine, e.g. "tx japanese" or "texas
sushi", a plausible real query pattern, returned zero results. Checked
against real data first rather than assumed: `area` (the next coarsest
geography field) doesn't contain state names or abbreviations, Texas
records have `area` values like "Houston" and "Dallas - Fort Worth," not
"Texas" or "TX" (verified across all 433 TX records). `state` ("TX") and
`state_name` ("Texas") were joined into the dataset from the start but
never added to `searchableAttributes`.

**Fix:** added `state` and `state_name` as two more siblings in the same
equal-priority location tier: `"city,area,neighborhood,state,state_name"`.
Both surface forms (abbreviation and full name) are real data already
present, not something to derive or fabricate, matching the same
"represent what's there, both forms" approach as `price`/`price_range`.
Covered by two new assertions in `test-search-quality.js` ("tx japanese",
"texas sushi", both checked against real TX Sushi/Japanese records).

**Cleanup 2026-07-23: dropped unused `searchable()` wrappers in
`attributesForFaceting`.** `food_type`, `city`, and `neighborhood` were
declared `searchable(food_type)` etc, which enables Algolia's
`searchForFacetValues` (a typeahead search *within* a facet's list of
values), separate from plain facet filtering. Checked the actual
front-end before touching anything: none of the three components using
these facets (`FoodTypeFacet`, `LocationMenu`, `NeighborhoodBar`) call
that API, none render a search-within-facet box. `food_type`'s wrapper
was a leftover from before the `cuisine_category` grouping, when raw
`food_type` had a "Search 114 cuisines…" typeahead directly; `city` and
`neighborhood` never had corresponding UI built. Removed all three
wrappers (`push-to-algolia.js` now declares them as plain facets) rather
than carry index config that doesn't match what's actually built, an
unexplained `searchable()` with no visible search box is a hard thing to
defend live if asked about it. Easy to re-add if a facet ever grows a
real typeahead need later (e.g. `city` at 916 distinct values, if the
dropdown outgrows a plain `<select>`).

---

## [Relevance] Custom ranking: Bayesian-adjusted rating

**Decision:** approved. `customRanking` uses a Bayesian-weighted score
(`(v/(v+m))×R + (m/(v+m))×C`, R = restaurant's own rating, v = its review
count, C = 4.294 dataset-wide average, m = 336 median review count as the
"how much evidence do we need" threshold) rather than raw `stars_count`.

**Why this framing matters for the debrief:** the important thing to be
able to demonstrate is recognising the vanity-metric problem in the first
place (evidenced concretely: 12 restaurants sit at a perfect 5.0★ with
2-5 reviews; naive ranking put a 15-review restaurant above places with
thousands of reviews). The Bayesian average is *one* valid fix, not *the*
answer, other approaches (a flat minimum-review threshold, a Wilson score
interval) would also be defensible. Diagnosing the problem correctly
matters more than which specific formula resolves it.

**Tunability to flag if challenged:** `m` (336, the median) is a judgment
call, not a fixed rule. Lower `m` = less correction (doesn't fully fix the
problem); higher `m` = more correction (risks unfairly suppressing newer
restaurants that haven't accumulated reviews yet, even if genuinely good).

---

## [Relevance] Geo-ranking

**Decision:** no custom ranking logic needed for proximity. Confirmed via
Algolia's docs: geo-distance is the *second* criterion in the default
ranking formula (after typo-tolerance, ahead of words/filters/proximity/
attribute/exact/custom). Passing `aroundLatLng` (real browser geolocation)
or `aroundLatLngViaIP` (fallback) at query time is sufficient, this is a
query-parameter decision, not an index-configuration one. See the UX
section above for the full fallback hierarchy.

**Bug found and fixed: geo was silently filtering, not just ranking.**
The above assumed `aroundLatLng`/`aroundLatLngViaIP` only affect ranking
because that's Algolia's documented tiebreaker behavior - but neither
`<Configure>` call ever set `aroundRadius`, so Algolia fell back to
computing one automatically. That automatic radius is a real, hard filter
on top of the ranking behavior, and it collapses to something tiny for any
query point far from the geographic center of the dataset. Confirmed
directly against the live index: with `aroundLatLng` set to a Sydney,
Australia coordinate, `index.search("Las Vegas")` (88 hits with no geo
param) returned **0**; with a legitimate US coordinate near Memphis it
still returned the full 1,416 hits for "new york" - so the failure mode
scales with how far the resolved location is from the dataset, and it's
silent (no error, just an empty-looking result set). This is also exactly
what a user reported hitting live: geolocation defaulting to "near
Memphis" (fine), then typing "new york" and getting nothing back.

**Fix:** added `aroundRadius="all"` to the app's one `<Configure>` in
`SearchApp.tsx`, which is Algolia's documented way to opt out of the
automatic radius entirely - geo then affects only ranking, exactly as this
entry originally (and incorrectly) assumed it already did. Verified via
direct index queries (Sydney case goes from 0 to 1,416 hits) and live in
the browser; `test-search-quality.js` re-run, still 18/18 (that suite's
own direct queries don't set `aroundLatLng` without a radius, so it was
never exposed to this bug).

**Compounding issue, separately fixed:** an active `city` refinement -
whether picked manually or auto-applied via geolocation detection (see
"[UX] Geo-detected city vs. free-text search" below) - is a genuine facet
filter, unaffected by `aroundRadius`. `city:Memphis AND query:"new york"`
is a legitimate 0-hit combination on its own terms; `aroundRadius="all"`
doesn't and shouldn't change that. That's addressed separately, see below.

---

## [UX] Facets: contextual vs. Dynamic Facets vs. progressive disclosure

**What's native and free:** Algolia always scopes facet values and counts
to the current filtered result set. Filter to New York, and every other
facet (e.g. `food_type`) automatically only shows values that actually
exist among NYC results, with correct counts. No configuration needed.

**Dynamic Facets (real Algolia feature, deliberately not used here):**
reorders which facet *categories* are shown prominently based on real
historical filter-usage patterns, recomputed daily. Confirmed in Algolia's
docs. Not used in this demo because it needs real usage history to have
anything to learn from, a fresh index with no traffic has no signal for
it to rank on. Worth naming as a roadmap capability in the mock customer
call, not something to fake with synthetic history.

**Progressive disclosure (a UI decision, being built):** `neighborhood`
(1,062 distinct values) is useless as a flat list, but becomes small and
genuinely useful once scoped to one city/area. Decision: only surface the
`neighborhood` filter once a city or area is selected, rather than
showing it (or hiding it entirely) at all times.

**Addendum: relocated from the sidebar to under the search bar.** The
`city` and `neighborhood` gate hasn't changed, only where it renders.
`NeighborhoodFacet` moved out of `FacetSidebar.tsx` into its own
`components/NeighborhoodBar.tsx`, rendered directly under `SearchHeader`
in `SearchApp.tsx` (above the desktop/mobile layout branch, so it applies
to both without duplicating it into the mobile filter sheet). Reasoning:
narrowing by neighborhood is the natural next step right after picking a
city via the same row's location pill, so putting them in the same visual
row reads as one flow instead of a pill up top and an unrelated-looking
sidebar section lower down. It also makes the facet visible on mobile
without opening the filter sheet, where it previously lived.

Also dropped the "Appears once a city is selected" placeholder text that
`NeighborhoodFacet` showed in the sidebar. In its old location, a fixed
sidebar slot benefited from that placeholder as a discovery hint. Under
the search bar, an idle "select a city" message would be transient UI
clutter every time no city is picked - the location pill itself already
signals "you haven't picked a place yet." Now the whole bar simply doesn't
render until a `city` refinement exists, same as `FoodTypeFacet`'s pattern
(silent until needed, no placeholder).

New requirement introduced by the move: showing "as many as fit on one
line," since it's now a horizontal row competing for width with the search
bar and location pill above it, not a vertical sidebar section with
unconstrained height. Implementation: the chip row is a plain
`flex-nowrap` flex container inside a fixed-width `overflow-hidden`
parent - whatever doesn't fit is clipped by the browser with no JS width
measurement needed - plus a toggle button kept *outside* that clipped
container (so it's never itself a candidate for clipping) that switches
the row to `flex-wrap` to reveal the rest. Verified in a live browser
against real refinements and a stress-tested synthetic set of 13 chips:
collapsed shows exactly what fits plus an always-visible "More ▾", expanded
wraps to reveal everything with "Show less".

---

## [UX] Cuisine grouping: `cuisine_category`

**What:** Added a `cuisine_category` field (`scripts/prepare-data.js`,
computed from `food_type` via a hand-reviewed lookup table) grouping the 114
raw `food_type` values into 13 browse-friendly categories: American, Italian,
Steakhouse, Seafood, French, Japanese, Mexican & Latin American, Indian,
Asian, Mediterranean & Middle Eastern, Spanish & Tapas, Southern/Creole/BBQ,
and Global/International/Other. Indexed as a plain (non-searchable) facet
(`attributesForFaceting` in `scripts/push-to-algolia.js`) alongside the
existing `searchable(food_type)`.

`food_type` is untouched - it stays the precise, searchable attribute it
already was. `cuisine_category` only exists as a coarser top-level browse
entry point.

**UI:** `FacetSidebar.tsx`'s Cuisine facet is now two levels. Level 1
(`CuisineFacet`) is a flat chip list on `cuisine_category` - 13 values needs
no search box, replacing the old "search 114 cuisines" typeahead on raw
`food_type`. Level 2 (`FoodTypeFacet`) surfaces `food_type` as a scoped
sub-filter, using the same progressive-disclosure pattern as
`NeighborhoodFacet` above: hidden until a `cuisine_category` refinement is
active (checked via `useCurrentRefinements`), then rendered with counts
already scoped to the filtered set - no extra query logic, this is native
Algolia behaviour.

**Judgment calls made grouping the 114 values (see the working draft this
was reviewed from for the full per-value breakdown):**
- **Californian (96 restaurants) folded into American**, not its own
  category, since it's a style of American cuisine rather than a distinct
  one. Still findable via the `food_type` second-level filter or free-text
  search.
- **Sushi (67) folded into Japanese** rather than split out, despite strong
  standalone search intent - `food_type` still catches an exact "sushi"
  query either way (see the existing search-quality assertion for this).
- **Barbecue (24) folded into "Southern, Creole & BBQ"** rather than
  standalone.
- **Hawaiian / Hawaii Regional Cuisine (40 combined) grouped under Asian**
  rather than American - a genuine fusion of both, Asian was the closer fit.
- **Gastro Pub (51) and other small/idiosyncratic values** (Fondue, Kosher,
  Beer Garden, etc.) land in the catch-all "Global, International & Other"
  bucket rather than getting their own category, to keep the top-level list
  at ~13 browsable entries.

**Verification:** `prepare-data.js` throws if any `food_type` value isn't in
the lookup table (same fail-loud pattern as the join-completeness check), so
a future data refresh with a new `food_type` value can't silently produce an
uncategorized record. Category counts sum to exactly 5,000 across all 13
buckets. `npm run test-search-quality` re-run after the index-settings
change: still 18/18 (existing assertions target `food_type`, which didn't
change).

---

## [UX] Rating facet: added, then removed same day - redundant with customRanking

**What:** Added and then removed 2026-07-22. `stars_count` was pushed and
used in `customRanking` from the start (see "Custom ranking:
Bayesian-adjusted rating"), but had no corresponding filter in
`FacetSidebar.tsx` - the provided mock-up (`DESIGN_PROMPT.md`) explicitly
calls for a star-rating filter alongside cuisine and payment. Built it as
a `useNumericMenu` ("4.5 & up" / "4 & up" / "3.5 & up", `>=` bounds -
`stars_count` is a near-continuous 1-5 float, so a refinement list would
have rendered one chip per distinct value), added `stars_count` to
`attributesForFaceting` in `push-to-algolia.js` since Algolia requires
that before an attribute can be used in `filters`/`numericFilters`, and
pushed it live (18/18 search-quality tests still passed).

**Why it was reverted:** while checking the threshold buckets against the
real distribution, it became clear `stars_count` is already the primary
signal in `customRanking` via the Bayesian-adjusted `popularity_score`
(see "Custom ranking: Bayesian-adjusted rating") - every results list is
already sorted best-rating-first by default. A minimum-rating *filter* on
top of that is solving a problem that doesn't really exist here: nobody
searches for low-rated restaurants, they just don't scroll past the good
ones, which sorting already handles. The one threshold that did
discriminate meaningfully ("4.5 & up," 31.8% of records) would mostly be
re-deriving "top of the list" as an explicit filter click. Unlike
`price` or `dining_style`, rating isn't an independent axis a user
excludes/includes on, it's the axis the list is already ordered by.

**Decision:** removed `RatingFacet` from `FacetSidebar.tsx` and reverted
`stars_count` out of `attributesForFaceting` (re-pushed live). Rating
stays visible per-card (stars + review count, see "Custom ranking:
Bayesian-adjusted rating") and continues to drive default ordering; it
doesn't also need to be a filter. Revisit only if there's a real signal
users want to explicitly exclude low-rated results from an otherwise
differently-sorted view (e.g. sorting by distance instead of relevance).

---

## [Relevance] Synonyms: manual curation now, AI Synonyms as roadmap

**Decision:** approved. Manually curate synonyms for genuine near-duplicate
`food_type` values found in the actual data, e.g. "Creole," "Cajun," and
"Creole / Cajun / Southern" all exist as separate values for what is
substantially the same cuisine; "American" and "Contemporary American"
likewise. This is a data-driven, evidence-based fix, not a guess.

**Why not build AI Synonyms instead:** confirmed in Algolia's docs, it
detects synonym candidates by analysing real query-rewrite patterns
across user sessions (e.g. someone searches "photos," doesn't click,
re-searches "pictures"). Needs real session history to function, a fresh
index has nothing for it to learn from. Same category as Dynamic Facets,
a genuine production capability, named as a talking point/roadmap item
rather than faked with synthetic history.

**Framing for the debrief:** recognising that `food_type` has
near-duplicate categories is as important as the fix itself.

---

## [Relevance] Measurement: how we'd know this is actually working

**The gap OpenTable doesn't have that ecommerce does:** ecommerce
measures itself in sales. Restaurant discovery's real conversion (a
completed reservation) happens entirely on OpenTable's own reservation
system, outside anything Algolia or this demo can see. The honest proxy
conversion event here is a click on "Reserve," not a completed booking.
Worth naming as a real limitation, not glossing over it.

**Native Algolia metrics (confirmed in their docs), once instrumented:**
No Results Rate (percentage of searches returning nothing, the single
most actionable relevance red flag), Click-Through Rate (percentage of
searches with at least one click), Conversion Rate (percentage of
searches leading to a defined conversion event). None of this is
automatic, Algolia only knows about a "click" or "conversion" if the
front-end explicitly fires an event via the Insights API, tagged with the
search response's `queryID`.

**A/B Testing (confirmed real, not used to fabricate a result):**
Algolia can run two index configurations or settings side by side and
report a statistical confidence score once it reaches 95%. This is the
real answer to "how do we know the Bayesian ranking is actually better
than the naive one", running both live and letting real click/conversion
data decide, not eyeballing a top-8 list.

**Decision on what to actually build:** wire real Insights API events
(queryID capture, click event on a result card, conversion event on
"Reserve" click), genuine, verifiable, small addition. Additionally build
a lightweight, custom, in-app panel that live-tallies these events during
the session itself (searches run, no-results occurrences, CTR), rather
than relying on Algolia's own Analytics dashboard, which needs real
accumulated traffic over time to populate and won't show anything
meaningful during a single demo/interview session. This is explicitly
framed in the mock customer call as an illustration of the same signal
that would feed Algolia's actual Analytics dashboard and A/B Testing
engine once real user volume exists in production, not a substitute for
either. Rejected: just showing a network-tab API call as "proof" of
tracking, correctly flagged as low-value on its own, it demonstrates the
event fires but not what it's for.

**Still to verify:** whether Algolia's own Analytics/Insights dashboard
is visible on whatever plan tier this trial account is on. Will check
directly in the dashboard rather than assume.

---

## [Relevance] Search-quality testing: typo tolerance, defaults were adequate

**What:** Built `scripts/test-search-quality.js`, an automated,
assertion-based test suite run against the live index (search-only key,
read-only), rather than one-off manual queries. Covers the brief's
explicit list, broad, specific, misspelled, ambiguous, location-sensitive,
and empty queries, plus the two named pain points from the discovery
notes (typos/concatenated words/partial names, and chains with multiple
locations in the same city). All cases use real names and cuisines pulled
from the actual dataset, not invented examples.

**Result:** 18/18 assertions passed against Algolia's default typo
tolerance settings. No changes were needed.

**Notable finding:** concatenated words ("unionkitchen", no space;
"vinotopiarestaurant") were resolved correctly with zero extra
configuration, Algolia's default word-splitting/typo handling already
covers a named pain point from the discovery notes without any custom
logic. Worth citing directly if asked "how did you handle concatenated
words."

**Chain disambiguation, verified concretely:** "The Union Kitchen" has
two genuine locations in Houston (Memorial Dr and Bellaire) in the real
dataset, exactly the pain point described ("chains have multiple
locations in the same city"). Searching the name returns both; supplying
coordinates near the Bellaire location correctly ranks it first, proving
geo-ranking is the actual disambiguator between two otherwise-identical
name matches, not something we need to build separately.

**Qualitative check ("grill", a deliberately vague query):** 347 results,
top 5 all genuinely well-rated (popularity_score 4.18-4.63) and spread
across different cities/cuisines rather than clustering oddly, evidence
the Bayesian custom ranking behaves sensibly even on vague input, not
just on the cherry-picked "top 8" comparison done earlier.

**Decision:** ship with Algolia's default typo tolerance settings. Tested
first rather than assumed adequate, and the test suite stays in the repo
as evidence, and as a regression check if the dataset or config changes
later.

---

## [Tooling] InstantSearch vs. the raw JS API client

**What:** Built on `react-instantsearch` (Algolia's React search-UI
library) for the primary search box, facets, pagination, and results
list, rather than hand-rolling query state management against the raw
`algoliasearch` JS API client.

**Why this needed checking first:** the GitHub repo that hosts this
assignment's supporting files (dataset, mock-up, scoring rubric) has a
README instructing candidates to build "without using instantsearch.js."
That README is a generic, reused template, not specific to this hiring
cycle. The actual PDF sent for this cycle explicitly supersedes it: "you
may use Algolia libraries such as InstantSearch, Autocomplete, the
JavaScript API client, or other tools that help you build a strong
demo." The PDF is what was actually assigned, so it governs, no
compliance risk in using InstantSearch.

**Why it's the better call, not just the permitted one:** a real
Solutions Engineer building a customer POC reaches for Algolia's own
supported UI library rather than reinventing facet-state management and
query building from scratch, that's the realistic, efficient choice, not
a shortcut. It also doesn't remove the parts that actually demonstrate
judgment: the Bayesian ranking, the geo fallback hierarchy, chain
disambiguation, the similar-restaurants cross-sell, and progressive
facet disclosure are all custom logic sitting on top of InstantSearch,
none of that is a pre-built widget. InstantSearch handles the standard
80% (search box, facet lists, pagination) so effort concentrates on the
20% that's actually interesting.

**Not all-or-nothing:** `react-instantsearch` for the primary UI, plus
direct calls to the `algoliasearch` JS API client for the bespoke pieces
that don't map to a pre-built widget, the similar-restaurants query, the
`aroundLatLng` vs. `aroundLatLngViaIP` fallback decision, and Insights
events. This mirrors how production Algolia integrations actually look,
standard tooling where standard tooling applies, custom code where the
problem actually needs it.

---

## [UX] Restaurant focus view: modal/drawer, not a full detail page

**What:** The "similar restaurants" cross-sell moment (see the map/UX
decision above) needs some view where a single restaurant becomes the
focus with adjacent suggestions around it. Decided: a modal/drawer
overlaid on the main search results, not a separate routed detail page.

**Why not a full page:** the reason that first seemed to justify one,
supporting Insights click-through analytics, doesn't actually require
it. The "click" event fires on interacting with a result card regardless
of what happens next, a modal, a drawer, or a full page all produce the
same signal. A full page's usual justification (SEO, shareable deep
links) doesn't apply here either, this is a hiring-assignment demo, not
a production consumer app with organic search traffic to capture.

**Why a modal/drawer instead of nothing:** the cross-sell feature was
already committed to and needs somewhere to live, dropping it entirely
wasn't the alternative under consideration. A modal/drawer gets the same
outcome (focused view, room for richer rating context, room for the
similar-restaurants rail, a clean click event) without routing, without
a separate layout, and without losing the user's search/map/facet state
in the background, which a full page navigation would.

---

## [UX] Geo-detected city applied as a real city refinement

**The bug (found by manual testing with a spoofed browser location):**
granting browser geolocation made the map center correctly and re-sort
results by proximity (`aroundLatLng` affects ranking, not filtering), but
the `city` dropdown in `SearchHeader.tsx` still read "All locations" (no
`city` refinement was ever applied), and the `neighborhood` facet stayed
hidden behind its "select a city first" placeholder. Three UI elements,
three contradictory stories about the same moment.

**The fix:** `scripts/build-city-centroids.js` (run as part of
`npm run prepare-data`) groups `data/restaurants.json` by `city`, averages
`_geoloc` per group, and writes `data/city-centroids.json`
(`{ [city]: {lat, lng} }`, 916 entries). `lib/geo.ts`'s `useGeoParams`
imports it and, once real coordinates arrive from
`navigator.geolocation` (tier 1 of the fallback hierarchy only - tier 2's
`aroundLatLngViaIP` resolves server-side inside Algolia's query, so the
client never sees a coordinate to work from), finds the nearest centroid
via plain haversine distance and exposes it as `detectedCity`.
`SearchHeader.tsx`'s `LocationMenu` applies it as a real `city` refinement
exactly once (ref-guarded, and only if nothing is refined yet, so it never
overrides a manual pick or a manual clear back to "All locations").
Because centroids are derived from the same `city` strings already in the
index, the match is always an exact, valid facet value - no fuzzy
matching or external geocoding API needed.

**Two bugs surfaced by testing this in the browser (both fixed, logged
here since they change what the code above actually looks like):**

1. **No distance cutoff.** Manually testing from a real Sydney, Australia
   coordinate (via `navigator.geolocation` in an automated browser
   session) matched to "Kalaheo," a small US town - the global nearest
   centroid is still *some* city no matter how far away the real
   coordinate is. Fixed with a `MAX_DETECTION_DISTANCE_KM = 80` cutoff in
   `nearestCity`: beyond that radius, `detectedCity` is left `undefined`
   and the existing ranking-only behavior applies, same as before this
   feature existed. 80km was picked as generous enough to cover sprawling
   US metro areas without claiming a match for someone nowhere near any
   dataset city.
2. **Dropdown still disagreed after a successful refine.** `useMenu`'s
   `items` array only holds the top ~60 cities by count (see
   `LocationMenu`'s `showMoreLimit`). Most of the dataset's 916 cities have
   very few restaurants (many have exactly 1), so a geolocation-detected
   city refined via `refine()` frequently isn't in that loaded window -
   `items.find(isRefined)` then finds nothing, and the pill silently fell
   back to "All locations" even though the filter was genuinely applied
   (confirmed: results correctly scoped to the refined city, "Remove
   {city}" chip present, but the dropdown lied). Fixed by reading the
   *actual* applied value from `useCurrentRefinements({ includedAttributes:
   ["city"] })` (mindful of its grouped-by-attribute shape - see
   `CLAUDE.md`'s note on this hook, which flags it as a repeat source of
   bugs in this codebase) as the source of truth for what's selected,
   independent of whether it's in the loaded menu window; an extra
   `<option>` is synthesized for the dropdown when the applied city isn't
   among the regular items.

---

## [UX] Geo-detected city vs. free-text search

**The bug (reported live):** with geolocation defaulting the location pill
to a city ("near Memphis" - fine, expected), typing a different place name
into the main search box ("new york") returned nothing, with no visible
explanation. Root cause: the auto-applied `city` refinement doesn't get
cleared just because the user starts typing, so the query silently becomes
`city:Memphis AND query:"new york"` - a real, legitimate 0-hit combination
(confirmed directly against the index) that has nothing to do with the
`aroundRadius` bug fixed above. The search box and the location picker
are deliberately separate refinements (see "[Tooling] InstantSearch vs.
the raw JS API client" / the facet architecture above) - that's fine when
the user *chose* the city themselves, but geolocation can now set it
silently, so a user who never consciously picked a city has no reason to
expect it's scoping their typed search.

**The fix:** `SearchHeader.tsx`'s `LocationMenu` now distinguishes a city
it auto-applied from one the user picked manually, via `autoAppliedCityRef`
(a ref holding the specific value that was auto-applied, not just a
boolean):
- The auto-apply itself is additionally gated on the search box being
  empty at the time (`!query.trim()`) - if the user's already typing when
  geolocation resolves, they've shown intent to search broadly, so it
  shouldn't apply at all.
- A second effect watches `query`: the moment it becomes non-empty, if the
  currently-applied city still equals the one *we* auto-applied, it's
  cleared (`refine("")`).
- Any manual interaction with the dropdown (`onChange`) immediately clears
  `autoAppliedCityRef`, regardless of what's picked - from that point on,
  the refinement is a deliberate user choice and typing something that
  doesn't match it is left alone, same as it always was. That 0-result
  case already has a real recovery path (`EmptyState`'s "Remove {city}" /
  "Clear search"), and manually re-picking the *same* city the auto-detect
  had chosen doesn't retroactively make it "not really a choice."

Verified live: an auto-applied city clears the instant a non-matching
query is typed (results go from 0/hidden to the full matching set); a
manually-picked city is left in place under the same typed query, showing
the ordinary 0-result recovery state instead.

---

## [Bug] The search box silently reset to empty the first time a query hit zero results

**Symptom (reported live):** typing a query character-by-character - e.g.
"new yrk" - would, at some specific character, silently wipe the search
box back to empty and show the full unfiltered result set, "as though the
page had been refreshed." No console error, no network request, no
address-bar change (all confirmed by testing) - so not a real navigation
and not a crash, a pure in-place state reset. It reproduced reliably on
the very first keystroke that produced this, regardless of dev-server
restarts, active city refinement, or query length - ruling out HMR
staleness, the geo-detected-city logic above, and query volume as causes.

**Root cause:** `EmptyState.tsx` called `useSearchBox()` itself to get
`query`/`clear`, and only mounts when `nbHits === 0`. Every call to a
react-instantsearch connector hook registers a *new* widget instance with
the shared InstantSearch index on mount. Per `useConnector`'s source
(`node_modules/react-instantsearch-core/dist/es/hooks/useConnector.js`),
a widget's initial state is computed by rebuilding the *entire* index's
UI state from scratch (`parentIndex.getWidgetUiState({})`) and feeding it
through the new widget's own `getWidgetSearchParameters`. For
`connectSearchBox`, that function is `searchParameters.setQueryParameter
('query', uiState.query || '')` - if that freshly-rebuilt `uiState.query`
read as stale/empty on this initial registration (a timing artifact of
the SearchBox widget being newly added mid-session rather than
present from `<InstantSearch>`'s first mount), it overwrote `query` back
to `''` on the *shared* Algolia helper instance used by every widget in
the app - not scoped to `EmptyState`'s own local state. That's what made
it look like a full app reset: same document, no navigation, everything
silently snapping back to defaults.

Confirmed the exact trigger empirically: typing "new yrk" character by
character, `"new yr"` (one keystroke before Algolia's typo tolerance
recovers it back to real "New York" matches) is a genuine 0-hit query
against the live index - precisely the moment `EmptyState` first mounts
and registers its own `SearchBox` widget instance.

**Fix:** `EmptyState` no longer calls `useSearchBox()`. `query` and
`onClearQuery` are passed down as props from `ResultsGrid.tsx`, which
already has a single, *permanently mounted* `useSearchBox()` call (added
for the min-query-length feature below) - so no second `SearchBox` widget
ever gets dynamically registered. `useCurrentRefinements`/
`useClearRefinements` (also used in `EmptyState`) don't implement
`getWidgetSearchParameters` at all, so they were never at risk and are
left as direct hook calls.

**Checked for the same pattern elsewhere:** `FoodTypeFacet` and
`NeighborhoodBar` also conditionally mount a connector hook
(`useRefinementList`, gated behind a `cuisine_category`/`city`
refinement being active). `connectRefinementList`'s
`getWidgetSearchParameters` *does* also exist, but it's scoped entirely
to its own facet attribute (`food_type`/`neighborhood`) via
`removeFacetRefinement(attribute)` - it never touches the shared `query`
or any other widget's state. Worst case there is a narrower, self-
contained reset of just that one facet's own selection, not a global
reset - not confirmed as happening, and not rewritten speculatively
without evidence it's a real problem.

**General takeaway for this codebase:** connector hooks that implement
`getWidgetSearchParameters` (confirmed here: `useSearchBox`, `useMenu`,
`useRefinementList`, `useConfigure`; confirmed *not* affected:
`useCurrentRefinements`, `useClearRefinements`) should be called from
components that are mounted once, for the app's lifetime - not from
components that mount/unmount based on downstream state (like result
count). If a hook like that is ever needed inside a conditionally-
rendered component, lift it to an always-mounted ancestor and pass the
values down as props instead, same as `EmptyState` now does.

---

## [UX] Minimum query length before showing results

**What:** search-as-you-type only *shows* results once the query is
empty or 3+ characters (`lib/searchConfig.ts`'s
`MIN_QUERY_LENGTH_FOR_RESULTS`) - 1-2 character queries are mostly noise
("n" alone matches thousands of records).

**How, deliberately:** the actual Algolia query still fires on *every*
keystroke via the plain, react-instantsearch-recommended
`value={query}` / `onChange={(e) => refine(e.target.value)}` binding on
the search box - nothing about when the real search executes is gated.
Only `ResultsGrid` and `ResultsMap` withhold what they *display* below
the threshold (a "keep typing" placeholder instead of hits; an empty
array instead of map pins, kept consistent between the two via the same
shared constant).

**Why not gate the input itself:** an earlier version of this held the
input's displayed value in local React state, only calling `refine()`
past the threshold - and Algolia's own team explicitly warns against that
exact pattern: decoupling a search box's displayed value from
`useSearchBox()`'s own `query` is a known source of unexpected resets.
Reverted in favor of the display-layer approach above, which never
diverges from the hook's own state.

---

## [UX] Area/city/neighborhood as facets, not a single-select location picker

**What changed:** removed the single-select `city` dropdown pill from
`SearchHeader.tsx` entirely (`LocationMenu`, and the `NeighborhoodBar`
under-header chip row it drove `neighborhood`'s progressive disclosure
alongside). Replaced with a three-level, all-multi-select facet hierarchy
in `FacetSidebar.tsx`: **Area** (51 clean metro/region values, always
shown) → **City** (916 values, appears once ≥1 area is checked) →
**Neighborhood** (1,062 values, appears once ≥1 city is checked), using
the same `useRefinementList`-backed checkbox pattern as every other facet
in the sidebar (Cuisine, Dining style, Payment), generalized into a
`GatedCheckboxFacet` component for the progressive-disclosure levels
(also now used for `food_type` under `cuisine_category`, replacing the
bespoke `FoodTypeFacet`).

**Why:** the single-select `city` pill meant location could only ever be
narrowed to exactly one value at a time - raised directly ("we need to add
area, city & neighbourhood as facets, as each one is narrowed down to
1"). Multi-select checkboxes (consistent with every other facet already
in the sidebar) fix that directly. `area` itself was already sitting
unused in the index (`attributesForFaceting` had it from early on - see
"Geography fields: what each one is actually for" above - flagging it as
"the top-level geo-browse facet," never wired into the UI) despite being
the cleaner, 51-value entry point `city`'s 916 messy/ambiguous values
never were (see the earlier "New York Ranch Rd address match" and
"Lafayette exists in LA/CO/CA/IN" findings this session).

**Deliberately not a bigger redesign:** the obvious next step - typeahead/
autocomplete so a specific area/city can be reached by typing rather than
scrolling a checkbox list - was raised and explicitly deferred ("that
raises a bigger question about search suggestion which I was thinking was
not in scope"). Free-text search already matches `area`/`city`/
`neighborhood` (all in `searchableAttributes`), so typing a place name
mostly gets you there today without a dedicated suggestion UI - the
facet checkboxes are the exploratory/browsing path, not the only path.

**Geo-detection retargeted from `city` to `area`:** `lib/geo.ts`'s
`detectedCity`/`nearestCity`/`city-centroids.json` (from "[UX]
Geo-detected city applied as a real city refinement" above) became
`detectedArea`/`nearestArea`/`area-centroids.json` (`scripts/
build-area-centroids.js`, same approach one level up the hierarchy -
group `data/restaurants.json` by `area` instead of `city`, average
`_geoloc`). `build-city-centroids.js` and its output were deleted
outright rather than left unused, since nothing imports them anymore now
that `city` isn't the geo-detection target. The one-shot auto-apply /
clears-on-typing behavior is unchanged in spirit (`FacetSidebar.tsx`'s
`AreaFacet` now owns it, was `SearchHeader.tsx`'s `LocationMenu`) - still
scoped to tier-1 (geolocation-granted) only, still fires once, still only
applies when nothing's refined yet and the search box is empty, still
clears itself the instant the user types (see "[UX] Geo-detected city vs.
free-text search" above for the full reasoning, unchanged) but a
manually-checked area is left alone. The distance cutoff widened from
80km to 150km since `area` values are broad regions - "you're in the
Denver / Colorado area" holds true from further out than a specific city
claim would.

**Known trade-off, accepted:** `AreaFacet`'s auto-apply state
(`useRef`-scoped) lives in a component that unmounts/remounts if the
viewport crosses the desktop/mobile breakpoint (`FacetSidebar` swaps
between the sidebar and the mobile filter sheet). Resizing across that
breakpoint right after manually clearing an auto-applied area can cause
it to be re-suggested once. Narrow, low-stakes, not worth hoisting this
state somewhere breakpoint-independent for.

---

## [Fix] IP-geolocated area detection

**The gap (raised directly):** area auto-detection only ever worked for
visitors who granted browser geolocation. Anyone who declined or ignored
that prompt fell back to `aroundLatLngViaIP` - which correctly re-centers
the map and re-ranks by proximity, but produced no `detectedArea`, so no
`area` ever got auto-checked and the gated **City** facet (visible only
once an area is refined - see "[UX] Area/city/neighborhood as facets"
above) never appeared. In practice this is the *common* path, not an edge
case: most visitors never see or don't act on the permission prompt.

**Why the earlier code assumed this was impossible:** this file previously
stated the IP-resolved coordinate "resolves server-side inside Algolia's
query and never reaches the client, so there is no coordinate here to
compute a nearest area from." That was wrong, checked directly against
Algolia's REST API docs and `algoliasearch-helper`'s `SearchResults`
source (`node_modules/algoliasearch-helper/src/SearchResults/index.js`):
every search response echoes back a top-level `aroundLatLng` string -
documented as "the position if the position was guessed by IP" - whenever
either geo param was sent. That's the *resolved* coordinate, available on
the client via the ordinary `results` object, regardless of which tier
produced it.

**The fix:** `lib/geo.ts` gains `useDetectedArea()`, which calls
`useInstantSearch()` and runs the same `nearestArea` haversine/150km-cutoff
lookup (now exported, shared instead of duplicated) against
`results.aroundLatLng`. `FacetSidebar.tsx`'s `FacetSidebar` calls this
hook directly instead of receiving `detectedArea` as a prop from
`SearchApp`/`useGeoParams` - `useGeoParams` no longer computes
`detectedArea` itself, since a single results-driven source now covers
both tiers instead of one client-side (tier 1) and one that never existed
(tier 2). `AreaFacet`'s auto-apply effect (one-shot, only when nothing's
refined and the search box is empty, clears itself the instant the user
types) is otherwise unchanged - it was already written to tolerate
`detectedArea` arriving asynchronously, which is exactly what happens now
on the IP path (undefined until the first response lands, then set).

**Net effect:** the common no-permission path now also lands the visitor
in a detected area with the City facet already available, matching the
browser-geolocation path exactly instead of being a degraded fallback.

---

## [UX] Removable location breadcrumb (Area › City › Neighborhood)

**Why:** auto-detecting and auto-checking an `area` (previous section)
means every visitor effectively starts *pinned into* one - useful as a
default, but only fair if there's an obvious way out for someone whose
search isn't local. `AreaFacet` already clears an auto-applied area the
moment the visitor types a query (see "[UX] Geo-detected city vs.
free-text search"), but that's not obvious from looking at the page, and
doesn't help someone who wants to browse a different area's facets rather
than type a query. Raised directly: show the current Area/City/
Neighborhood selection as a removable breadcrumb.

**What:** `components/LocationBreadcrumb.tsx`, rendered in `SearchApp.tsx`
directly below `SearchHeader` (both desktop and mobile, above the
list/map layout split). Reads `useCurrentRefinements({ includedAttributes:
["area", "city", "neighborhood"] })` and renders one pill per refined
value, in fixed Area → City → Neighborhood order (not whatever order the
hook itself returns), with a `›` separator between levels. Renders
nothing when no location refinement is active.

**Location-only, not all active filters (decided over the alternative):**
the breadcrumb shows only the three location levels. Cuisine, price,
dining style, and payment stay removable in `FacetSidebar` only, not
duplicated here - this is specifically the "you're pinned somewhere,
here's the escape hatch" control, not a general active-filters bar.

**Cascade removal, not independent pills (decided over the alternative):**
removing a level's pill also clears every refinement at the levels below
it - removing an Area clears its City and Neighborhood refinements too;
removing a City clears Neighborhood. Without this, removing e.g. Area
while a City is still checked would leave that City refinement silently
narrowing results even though `GatedCheckboxFacet` has already hidden the
City facet in the sidebar (its gate, `area`, is no longer refined) - an
invisible filter with no visible control left to remove it. Independent
per-pill removal was considered and rejected for exactly that reason.

**Implementation note:** `useCurrentRefinements` groups its `items` by
attribute, not by value (see `CLAUDE.md`'s note on this hook - a repeat
source of bugs in this codebase). The breadcrumb looks up each of
`area`/`city`/`neighborhood`'s group explicitly by attribute rather than
assuming array order, and calls the hook's own `refine(refinement)` for
both the clicked pill and, for cascade, every refinement object in the
lower-level groups.

---

## [Bug] Closing the mobile filter sheet silently cleared every active filter

**Found while manually testing the breadcrumb above:** on mobile, checking
an Area (or any facet - Cuisine, Price, anything in `FacetSidebar`) then
closing the "Filters" bottom sheet (via its own X or "Show results") wiped
the refinement immediately - confirmed live, repeatedly, with both the new
Area facet and a plain one (Cuisine -> American): check the box, close,
reopen - unchecked, result count back to the full unfiltered set. Not
specific to today's Area/breadcrumb work; it affected every facet in the
sidebar and predates this session's changes.

**Root cause:** `SearchApp.tsx`'s mobile layout rendered the filter sheet
as `{filtersOpen && (<div>...<FacetSidebar/>...</div>)}` - closing it
fully unmounted `FacetSidebar`, and therefore every `useRefinementList`
widget inside it (Area, City, Neighborhood, Cuisine, Food type, Dining
style, Payment). `connectRefinementList`'s `dispose()` (`node_modules/
instantsearch.js/es/connectors/refinement-list/connectRefinementList.js`)
calls `removeFacet`/`removeDisjunctiveFacet(attribute)` on unmount - so
every one of those facets' selections was stripped from search state the
instant the sheet closed. This is exactly the risk this file's own "[Bug]
The search box silently reset..." entry already named for this component
("connector hooks... should be called from components that are mounted
once, for the app's lifetime... if a hook like that is ever needed inside
a conditionally-rendered component, lift it to an always-mounted
ancestor") but had flagged as unconfirmed, not yet known to actually
happen. It does. The desktop `<aside>` never had this problem because it
renders `FacetSidebar` unconditionally, for the app's whole lifetime.

**The fix:** `MobileFilterSheet` (new, `SearchApp.tsx`) renders
`FacetSidebar` unconditionally too, for as long as the app is in mobile
mode (guarded on `!isDesktop`, not on `filtersOpen`). Open/close is now
purely a CSS state - `opacity`/`pointer-events` on the backdrop,
`translate-y` on the sheet itself - never a mount/unmount. This also
fixed a side effect that came for free: the sheet now slides open/closed
instead of popping, since the panel's already in the DOM to animate.

**Accepted, unchanged trade-off:** crossing the desktop/mobile breakpoint
itself still unmounts/remounts `FacetSidebar` (swapping between the
`<aside>` and `MobileFilterSheet` entirely) - this is the same rare,
low-stakes case `AreaFacet`'s own doc comment already accepts for its
`useRef`-scoped auto-apply state, not the frequent every-open/close case
this fix addresses.

---

## [Bug] Tier-1 (granted browser geolocation) area detection was silently broken

**Reported live:** granting browser geolocation and overriding it to a
real US city (San Francisco, via a permission grant + coordinate
override) still showed the full unfiltered 5,000 - no area auto-applied,
Area facet still showing every region unchecked. This is a real
regression from "[Fix] IP-geolocated area detection" above, not the
Sydney/no-match case also reported the same session (that one - IP
resolving to a real coordinate genuinely >150km from every dataset area -
is correct, intentional behavior, not a bug; this one is).

**Root cause:** that fix unified area detection onto
`results.aroundLatLng` (Algolia's response field) for *both* geolocation
tiers, on the assumption every geo-enabled query gets one back. Checked
directly against the live API and that assumption is only half true:
`aroundLatLng` is only present on the response when Algolia had to
*guess* the position from IP - a query that supplies a real `aroundLatLng`
directly (tier 1) gets a response with no such key at all, since the
server was never asked to compute one. `useDetectedArea` reading
`results.aroundLatLng` unconditionally meant tier 1 always saw
`undefined`, no matter how good the real coordinate was - it had
correctly worked before that fix (computed directly, synchronously, from
`navigator.geolocation`'s own coordinate) and was broken by it.

**The fix:** `useDetectedArea(knownAroundLatLng?)` now takes the tier-1
coordinate as a parameter when the caller already has one (`geo.aroundLatLng`
from `useGeoParams`, threaded down through `FacetSidebar`'s new
`aroundLatLng` prop from both `SearchApp.tsx` call sites - the desktop
`<aside>` and `MobileFilterSheet`) and only falls back to reading
`results.aroundLatLng` when it doesn't - i.e., tier 2. Tier 1 is
computed directly again, exactly as it worked before "[Fix] IP-geolocated
area detection"; tier 2 keeps that fix's addition. Verified live:
granted geolocation forced to a real US coordinate now auto-applies the
matching area and filters correctly again.

---

## [UX] Area facet hides once an area is refined

**Raised directly, after seeing the breadcrumb + Area facet together on a
real detected area:** once an area is refined (auto-detected or manually
picked), showing the full 51-checkbox Area list in the sidebar *and* the
removable pill in `LocationBreadcrumb` above it is redundant - the same
piece of state controlled two visible ways at once, one of which (a wall
of mostly-irrelevant unchecked regions) adds nothing once the breadcrumb
already shows and controls the pick.

**The fix:** `AreaFacet` (`FacetSidebar.tsx`) returns `null` once
`hasAnyAreaRefined` is true, hiding the section entirely - City (already
visible at that point) becomes the first section in the sidebar. Only the
*rendered* checkboxes are hidden; the `useRefinementList` call itself
keeps running exactly as before regardless of this branch - unmounting
that widget instead would reintroduce "[Bug] Closing the mobile filter
sheet silently cleared every active filter" above (a `useRefinementList`
widget disposes its refinement on unmount). To refine to a *different*
area, the current one has to be removed via its breadcrumb pill first,
which un-hides the full list - the same "clear the parent before picking
a new one" shape already used for City -> Neighborhood.

**Known trade-off, accepted:** this makes it harder to add a *second*
area alongside an already-refined one purely from the sidebar (the
checkbox list isn't there to check another box) - multi-select at the
City/Neighborhood level is unaffected. Given detection now auto-applies a
single area in the common case, optimizing for "one area at a time,
clearly removable" over "always-visible multi-add" is the right trade for
this UI, at least for now.

---

## [UX] Default area fallback when detection is out of range

**Raised directly, after confirming live that a real visitor (Sydney,
not a VPN) genuinely has no area within `MAX_DETECTION_DISTANCE_KM` of
every one of the 51 dataset areas:** for a demo, is showing the entire
unfiltered 5,000-restaurant catalog to that visitor the right call, or
should there be a sensible default? Decided: default to the single
most-popular area (highest restaurant count) rather than leaving
everything unfiltered.

**Why this doesn't undermine the honesty the distance cutoff exists
for:** the cutoff (see "[UX] Geo-detected city applied as a real city
refinement" / the Sydney/Kalaheo finding) exists so the app never
falsely claims "you're near X" for someone nowhere near any dataset
area. A popularity-based default doesn't make that claim either - the
resulting pill reads exactly like any manually-picked area (no "detected
near you" copy anywhere near it), so nothing about a visitor's real
location is misrepresented. It's the same reasoning a normal e-commerce
site uses defaulting to a flagship market when it has no signal for a
visitor's actual location, not a geolocation claim.

**The fix:** `lib/geo.ts`'s `useDetectedArea` now returns
`{ area, hasCoordinate }` instead of a bare area string -
`hasCoordinate` is `true` once a real coordinate was actually checked
(tier 1's known value, or tier 2's `results.aroundLatLng` once the first
response lands), independent of whether it matched an area. This lets
`AreaFacet` (`FacetSidebar.tsx`) distinguish "still waiting to check"
(`hasCoordinate: false` - do nothing yet) from "checked, and genuinely
out of range" (`hasCoordinate: true`, `area: undefined` - apply the
fallback). The fallback candidate is `items[0]` from the same
`useRefinementList` call `AreaFacet` already has - Algolia's default
facet sort is count-descending, so this is the top-count area with no
extra query or hardcoded value needed. The existing once-only guard,
"clears itself the instant the user types," and "left alone once
manually picked" behavior all apply identically to a fallback-applied
area as to a genuinely detected one, since both paths converge on the
same `refine()`/`autoAppliedAreaRef` call.

Verified live: reloading from the real out-of-range (Sydney) connection
now auto-applies "New York / Tri-State Area" (the highest-count area)
and filters to its 1,414 restaurants on first load, with the Area facet
correctly hidden per the fix above; typing a query still clears it back
to the full unfiltered set, same as a real detected area would.

---

## [Data] Dead image_url field

**What:** `image_url` points at OpenTable's legacy image CDN path
(`opentable.com/img/restimages/{id}.jpg`). Sampled 30 random records
(`scripts/check-image-urls.js`), all 30 now redirect to the exact same
generic OpenTable placeholder (`cdn.otstatic.com/legacy-cw/
default2-original.png`), not a real photo, not distinct per restaurant.
This dataset is roughly 10 years old (scraped via the `sosedoff/opentable`
project, credited in the assignment's own README), and the legacy CDN
path it points to appears fully deprecated.

**First pass got this wrong, twice, worth being honest about both:**

1. Initially dropped the field entirely during data prep
   (`prepare-data.js`), conflating cleaning/transforming source data with
   choosing what to expose in the product, the same mistake flagged
   earlier in this project, resurfacing in a new spot.
2. Corrected that to keep the field in the local data but explicitly
   exclude it from what's pushed to Algolia (mirroring how
   `payment_options_raw` is handled). Reasonable-sounding, but wrong for
   a different reason: it's not equivalent to `payment_options_raw`
   (genuinely internal/debug-only data with no product use). `image_url`
   is real customer-provided data that happens to be stale, and the
   decision already made for the price/price_range discrepancy was to
   represent imperfect real data as-is and flag it, not suppress it.
   Applying that logic inconsistently to `image_url` was the actual
   error.

**Final decision: use `image_url` as-is, everywhere**, pushed to
Algolia and rendered in the UI exactly like every other field. It
resolves to a generic OpenTable placeholder image for every restaurant
(confirmed via `scripts/check-image-urls.js`: 30/30 sampled records
redirect to the same URL), not a real photo. That's presented plainly as
a known limitation of a ~10-year-old scraped dataset, not engineered
around. There is no alternative image source available to substitute,
inventing or sourcing photos from elsewhere would misrepresent specific
restaurants with images that aren't actually theirs, a worse problem
than a generic placeholder. `RestaurantCard.tsx` and
`RestaurantModal.tsx` both render `image_url` directly and fall back to
text only on an actual load error, no special-casing for the fact it's
stale.

---

## Open questions I'd raise with the customer (not resolved unilaterally)

- Why do `price` and `price_range` disagree ~4% of the time, and which
  system is the source of truth going forward?
- Is there a reason tier "1" never appears in `price`? Missing segment, or
  a scale that only ever went 2-4 for this export?
- How should "Cash Only" restaurants be represented in a payment filter,
  as a genuine gap, or worth a non-card indicator of their own?
- Is there a current, live image source to replace the dead legacy
  `image_url` field, or does the production experience need to be
  designed around not having restaurant photos at all?
