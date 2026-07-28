# Approach

A restaurant discovery demo for OpenTable, built to show what a modern search and discovery layer on Algolia could look like on top of their own data.

This is a high-level description of the approach taken, further details can be provided as required.

## Data

`restaurants_list.json` and `restaurants_info.csv` join cleanly on `objectID` once both are normalised to the same type (0 missing joins across 5,000 records). Payment options are normalised to the four required card brands; the raw list is kept alongside for completeness. Where the two files disagree, most notably `price` (a numeric tier) and `price_range` (a text bucket) matching most of the time, but not all. Ultimately decided to choose the pricing tier to show and use as filtering, though this is mostly arbitrary and could easily include one or the other, or both. This decision would depend on the customer and the origin of that data.

It is noted that the `image_url` fields all redirect to a placeholder.

An additional field, `cuisine_category` (surfaced as "Cuisine" in the UI) was created as a rough-cut grouping of the `food_type` field since it was very broad. There are likely errors and inconsistencies, but sufficiently demonstrates the concept and provides additional data points on which to improve keyword search.

## Index and relevance

Searchable attributes are prioritised: `name` > `food_type`/`cuisine_category` > `city`/`area`/`neighborhood`/`state`/`state_name` > `dining_style` > `address`, so a strong name match always wins but a half-remembered street name still resolves once name search comes up empty. Custom ranking uses a Bayesian-adjusted rating (`popularity_score`) rather than raw star count, correcting for the vanity-metric problem of a handful of 5-star restaurants with only 2-3 reviews outranking places with thousands. Typo tolerance was tested, not assumed: a 26-assertion suite against the live index (`npm run test-search-quality`) covers concatenated words, chain disambiguation via geo-ranking, and broad/misspelled/ambiguous/empty queries.

`food_type`'s 114 raw values was grouped into 13 browse-friendly `cuisine_category` buckets for the primary Cuisine facet, with `food_type` itself surfacing as a second-level filter.

`dining_style` was added as a searchable tier (between location and `address`), not just a facet - it was originally facet-only, but that left a real recall gap: queries like "fine dining seafood" couldn't reach records that only expressed that signal via `dining_style`

`state_name` was added using the full name of the state to cater for such searches as "sushi texas" that wouldn't otherwise be captured

A handful of synonyms were manually curated from genuine near-duplicate `food_type` values in the actual data, rather than a full taxonomy. The most useful examples are ones where Algolia's own typo tolerance and prefix matching can't already bridge the gap: `steakhouse` -> `steak` (one-way - "steak" already reaches "Steakhouse" by prefix matching, but the reverse needs the full 5 extra characters, well past default typo tolerance) and `hawaiian`/`hawaii regional cuisine` (two labels for what's practically the same cuisine in this data, an 8-letter vs. 6-letter word, also outside default typo tolerance). `creole`/`cajun`/`creole-cajun-southern` is the same idea for a three-way case. (A fourth pair, `american`/`contemporary american`, is in the index but is a weaker example - "American" is already a literal substring of "Contemporary American," so it's mostly redundant with normal tokenization.

## Front-end

Built on `react-instantsearch` library for the standard 80% (search box, facets, pagination), with direct `algoliasearch` client calls for the pieces that don't map to a pre-built widget: the geo fallback hierarchy and the "similar restaurants" cross-sell. Designed for both personas named in the discovery notes: known-item search (fast, forgiving, typo-tolerant, chain disambiguation via location) and open-ended discovery (a map alongside results, browsable cuisine/price/dining-style/neighbourhood facets, a "you might also like" recommendation rail on every restaurant). Browser geolocation, once granted, is reconciled across every surface, the map centres correctly, the location picker reflects the detected city, and the neighbourhood facet activates immediately, rather than three UI elements disagreeing about where the user is. Facets that have too many raw values to show usefully up front (`city`: 916, `neighborhood`: 1,062) use progressive disclosure - `city` only appears once an `area` is checked, `neighborhood` only once a `city` is checked, same pattern for `food_type` under `cuisine_category` - rather than dumping every value on the user at once.

The UI is intended to cover the 2 personas provided, though in both cases a location is either provided or determined. A user would typically be looking in the area which they currently reside and is a safe and expected assumption, but caters for them wanting to search in a different location.

### Geo Location

Testing was based in Australia, where there are no restaurants in the data, where browser geo-location was not available and IP-based geo-location fell outside the US, the decision to arbitrarily place the user in the centre of the New York region was taken as it contains the most results. This is clearly not intended for a production system and is purely for demonstration purposes.

Maps were provided as a simple UX demonstration

## Judgment calls worth highlighting

Imperfect data is represented honestly rather than cleaned into something false: `price` vs `price_range` are both kept, and the `image_url` field (confirmed dead, resolves to a generic placeholder for every restaurant) is used as-is rather than faked or silently dropped. Nothing in the UI claims a signal the data doesn't support, no fabricated "N people viewing this now," no booking/availability UI, since none of that exists in the source data. Cuisine grouping and the geo-city reconciliation both go beyond the literal brief, aimed at the "not compelling enough" pain point named explicitly in the discovery notes, not just making search technically work.

## What I'd do next with more time (or if it was a real opportunity)

- Wire the Insights API (query ID capture, click/conversion events) and a lightweight in-session panel to demonstrate the same signal that would feed Algolia's Analytics dashboard and A/B testing in production.
- Take a few open questions back to the customer rather than guess: why `price` and `price_range` disagree ~4% of the time and which system would be the source of truth going forward; why price tier "1" never appears in `price` at all (a missing segment, or a scale that only ever went 2-4 in this export); how "Cash Only" restaurants should be represented in a payment filter, as a genuine gap or worth a non-card indicator of their own; and whether they capture anything like party size or table capacity, a genuinely useful facet for larger groups that isn't in this dataset today.
- Search suggestions are a key way to improve the user experience and reduce typographical errors
- To improve the user experience, the information provided on the map could be improved to include more information other than the restaurant name, but this is more of a UX/CX feature so was deliberately excluded
