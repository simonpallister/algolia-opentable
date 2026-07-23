# Front-End Design Brief

A prompt for exploring visual/UX direction before building the real
front-end. Written to be edited by hand, this is a starting point, not a
final spec. Included in the assignment submission as evidence of
deliberate UX thinking (see `DECISIONS.md` for the reasoning behind the
choices baked in here).

---

**Copy everything from "## Prompt" below down to the end of the file
into Claude Design.** Nothing below this line references this file or
`DECISIONS.md`, it's self-contained on purpose.

---

## Prompt

Design a restaurant discovery web app for a demo
for OpenTable, a restaurant reservation platform, to show what a modern
search and discovery experience could look like on top of their
restaurant data. This is a B2B sales demo for a search infrastructure
vendor (Algolia), not OpenTable's actual product, so it should look like
a fresh, contemporary consumer app, not a reskin of OpenTable's real
site.

The actual colours are not important but should be modern and fun looking, reflecting the activity that it represents.

**It replaces this outdated experience** (for context only, do not
recreate it): a single search bar, a left sidebar of checkbox filters
(cuisine, star rating, payment method), and a plain vertical list of
results with a "Show More" button. Dated, transactional, no sense of
place or discovery.

### Two user types to design for, in the same interface

1. **Knows what they want.** Has a specific restaurant in mind, maybe
   misremembers the spelling, maybe there are multiple locations of the
   same chain in their city. Needs to find the right one, fast.
2. **Doesn't know what they want yet.** Browsing, open to inspiration,
   deciding based on cuisine, price, location, and how good a place
   actually is. Wants to feel like they're exploring, not filling out a
   form.

Design for both without making either one feel like an afterthought.
A search that starts a specific-name lookup should still make it easy to
drift into browsing (e.g. "similar restaurants nearby" once you land on
one).

### Required screens/states

- **Main search/discovery view.** Persistent text search bar (the
  primary input, this is a text-search product, not a pure browse/filter
  tool). Results as cards, not a bare list, each card should read well
  at a glance: name, cuisine, price ($ signage), a clear quality/rating
  indicator, neighbourhood/city, and a "Reserve" call to action that's
  visually secondary to the card itself (it's a hand-off, not the point
  of this screen).
- **Map, shown alongside results, not instead of them.** Should visualise
  wherever the current result set actually is. Needs a sensible default
  view when the user hasn't granted location (e.g. centred on whatever
  city/area is implied by their search or IP-based approximation, not a
  blank world map).
- **Filter/facet panel.** Cuisine, price, dining style, payment method.
  Cuisine specifically has ~114 raw values, don't design a flat checkbox
  list for it, it needs to either group into broader families or be a
  searchable/typeahead filter. A finer-grained "neighbourhood" filter
  should only appear once a city/area is already selected (it's
  meaningless as a flat list beforehand).
- **"Similar restaurants" moment.** When a user lands on a specific
  restaurant (via search or a card), show a small set of adjacent
  suggestions (same cuisine/area/price tier). This is the cross-sell
  between the two personas, frame it as "you might also like," not as a
  replacement for what they searched.
- **Empty/no-results state.** Needs to feel like a recovery path, not a
  dead end, e.g. suggest removing a filter or broadening the search,
  never just "no results found."
- **Mobile/touch.** Design should hold up on a phone-sized viewport. This
  is a named grading line in Algolia's own scoring rubric ("Account for
  different use cases (e.g. mobile, touch)"), not a nice-to-have.
  Filters and map likely need a collapsed/sheet-style treatment on small
  screens rather than a fixed sidebar.

### Explicit constraints

- **No date/time/party-size booking UI.** This demo stops at "help the
  user find the right restaurant and hand off to Reserve." No
  availability/booking mechanics exist in the underlying data or this
  demo, don't design for them.
- **No fabricated real-time signals** (e.g. "12 people viewing this now,"
  "booked 5 times today"), nothing in the data supports it, and
  inventing it would misrepresent what's real for the mock customer call.
- **Feasibility over polish.** This needs to be built with
  `react-instantsearch` (Algolia's React search UI library), Leaflet +
  OpenStreetMap for the map, and Tailwind for styling, in a short
  timeframe. Prefer interaction patterns that map cleanly onto those
  tools (standard cards, lists, facet panels, marker clusters) over
  bespoke animations or layouts that would be expensive to actually
  build.
- **Rating display should read as trustworthy, not just a star count.**
  The underlying ranking already corrects for restaurants with very few
  reviews, the UI should reflect that a rating means something (e.g.
  showing review count alongside the star rating, not stars alone).

### Out of scope for this design pass

- Restaurant detail/full profile page (beyond what's in the card and the
  "similar restaurants" rail), unless you decide it's worth the time.
- Any account/login/saved-favourites functionality, not asked for.
- The in-app Insights/analytics panel (separate build item, not a
  visual-design concern).
