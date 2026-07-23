/**
 * Shape of a record in the live Algolia `restaurants` index, as produced by
 * scripts/prepare-data.js + scripts/push-to-algolia.js. Kept in sync with
 * DECISIONS.md manually - if the data pipeline changes a field name, update
 * this and the compiler will point at every place that broke.
 *
 * `payment_options_raw` is deliberately NOT here - it's dropped before the
 * index push (see push-to-algolia.js), so it never reaches the front-end.
 */

export type PaymentOption = "AMEX" | "Visa" | "Discover" | "MasterCard";

export interface GeoLoc {
  lat: number;
  lng: number;
}

export interface Restaurant {
  objectID: string;
  name: string;
  address: string;
  neighborhood: string;
  area: string;
  city: string;
  state: string;
  state_name: string;
  postal_code: string;
  country: string;
  _geoloc: GeoLoc;
  phone: string;
  food_type: string;
  /**
   * One of 13 browse-friendly groupings of `food_type` (e.g. "Asian" covers
   * Thai/Vietnamese/Chinese/Korean/...), used as the primary Cuisine facet -
   * see DECISIONS.md, "Cuisine grouping." `food_type` stays the precise
   * second-level facet once a category is selected.
   */
  cuisine_category: string;
  dining_style: string;
  /** OpenTable's numeric price tier (2-4 in this dataset; no tier 1). */
  price: number;
  /** `$` / `$$` / `$$$` / `$$$$` signage derived from `price`. */
  price_display: string;
  /** Plain-English bucket, the customer-facing facet - see DECISIONS.md. */
  price_range: "$30 and under" | "$31 to $50" | "$50 and over" | string;
  stars_count: number;
  reviews_count: number;
  /**
   * Empty array for the one Cash-Only restaurant in the dataset (see
   * DECISIONS.md, "Payment options normalisation") - render as "Cash only",
   * not a blank row.
   */
  payment_options: PaymentOption[];
  /**
   * Confirmed dead (see DECISIONS.md, "Dead image_url field") - resolves
   * to a generic OpenTable placeholder for every record, not a real
   * photo. Used as-is anyway, it's real customer-provided data, not
   * suppressed just because it's stale. RestaurantCard/RestaurantModal
   * render it plainly and fall back to text only on an actual load error.
   */
  image_url: string;
  reserve_url: string;
  mobile_reserve_url: string;
  /**
   * Bayesian-adjusted rating used as the primary customRanking criterion
   * (see DECISIONS.md, "Custom ranking: Bayesian-adjusted rating"). Not
   * shown directly in the UI - `stars_count` + `reviews_count` together are
   * what's displayed, this is what orders the results.
   */
  popularity_score: number;
}
