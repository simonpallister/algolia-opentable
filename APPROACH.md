# Approach

A restaurant discovery demo for OpenTable, built to show what a modern
search and discovery layer on Algolia could look like on top of their own
data, not a reskin of their current site. Full reasoning trail for every
decision below lives in `DECISIONS.md`; this is the short version.

## Data

`restaurants_list.json` and `restaurants_info.csv` join cleanly on
`objectID` once both are normalised to the same type (0 missing joins
across 5,000 records, verified, and the script fails loudly rather than
indexing partial records if that ever stops being true). Payment options
are normalised to the four required card brands; the raw list is kept
alongside for provenance. Where the two files disagree, most notably
`price` (a numeric tier) and `price_range` (a text bucket) matching only
~96% of the time, both fields are kept and surfaced rather than one
silently discarded, real data is often imperfect, and picking a winner
unilaterally would be a worse outcome for a customer than flagging the
discrepancy.

## Index and relevance

Searchable attributes are prioritised `name` > `food_type` >
`city`/`area`/`neighborhood` > `address`, so a strong name match always
wins but a half-remembered street name still resolves once name search
comes up empty. Custom ranking uses a Bayesian-adjusted rating
(`popularity_score`) rather than raw star count, correcting for the
vanity-metric problem of a handful of 5-star restaurants with only 2-3
reviews outranking places with thousands. Typo tolerance was tested, not
assumed: an 18-assertion suite against the live index (`npm run
test-search-quality`) covers concatenated words, chain disambiguation via
geo-ranking, and broad/misspelled/ambiguous/empty queries, 18/18 passing
on Algolia's defaults, no custom tuning needed. `food_type`'s 114 raw
values are grouped into 13 browse-friendly `cuisine_category` buckets for
the primary Cuisine facet, with `food_type` itself surfacing as a
progressively-disclosed, precise second-level filter.

## Front-end

Built on `react-instantsearch` for the standard 80% (search box, facets,
pagination), with direct `algoliasearch` client calls for the pieces that
don't map to a pre-built widget: the geo fallback hierarchy and the
"similar restaurants" cross-sell. Designed for both personas named in the
discovery notes: known-item search (fast, forgiving, typo-tolerant, chain
disambiguation via location) and open-ended discovery (a map alongside
results, browsable cuisine/price/dining-style/neighbourhood facets, a
"you might also like" recommendation rail on every restaurant). Browser
geolocation, once granted, is reconciled across every surface, the map
centres correctly, the location picker reflects the detected city, and
the neighbourhood facet activates immediately, rather than three UI
elements disagreeing about where the user is, a real bug found and fixed
during manual testing.

## Judgment calls worth highlighting

Imperfect data is represented honestly rather than cleaned into
something false: `price` vs `price_range` are both kept, and the
`image_url` field (confirmed dead, resolves to a generic placeholder for
every restaurant) is used as-is rather than faked or silently dropped.
Nothing in the UI claims a signal the data doesn't support, no fabricated
"N people viewing this now," no booking/availability UI, since none of
that exists in the source data. Cuisine grouping and the geo-city
reconciliation both go beyond the literal brief, aimed at the "not
compelling enough" pain point named explicitly in the discovery notes,
not just making search technically work.

## What I'd do next with more time

Wire the Insights API (query ID capture, click/conversion events) and a
lightweight in-session panel to demonstrate the same signal that would
feed Algolia's Analytics dashboard and A/B testing in production. On the
data side, I'd take a few open questions back to OpenTable rather than
guess: why `price` and `price_range` disagree ~4% of the time, whether a
current image source exists to replace the dead legacy CDN, and whether
they capture anything like party size or table capacity, a genuinely
useful facet for larger groups that isn't in this dataset today.
