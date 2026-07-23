/**
 * Below this length, search-as-you-type is mostly noise ("n" alone matches
 * thousands of records). The actual Algolia query still fires on every
 * keystroke as usual (react-instantsearch's own guidance: never decouple
 * the search box's displayed value into local state to gate this, that's
 * a known source of state-reset bugs - see DECISIONS.md, "[UX] Minimum
 * query length before showing results"). Instead, results/map hits are
 * simply not *shown* until the query reaches this length, or is cleared
 * back to empty.
 */
export const MIN_QUERY_LENGTH_FOR_RESULTS = 3;
