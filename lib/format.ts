import type { PaymentOption } from "@/types/restaurant";

/** Gold star string for a given rating, e.g. 4.7 -> "★★★★★☆" rounds to 5 filled. */
export function starString(rating: number): string {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(full) + "☆".repeat(5 - full);
}

const PAYMENT_LABELS: Record<PaymentOption, string> = {
  AMEX: "Amex",
  Visa: "Visa",
  Discover: "Discover",
  MasterCard: "Mastercard",
};

/**
 * `payment_options` is empty for the one Cash-Only restaurant in the
 * dataset (see DECISIONS.md, "Payment options normalisation") - that's a
 * real, deliberate edge case to render as "Cash only", not a blank row.
 */
export function paymentLabels(options: PaymentOption[]): string[] {
  if (!options || options.length === 0) return ["Cash only"];
  return options.map((option) => PAYMENT_LABELS[option] ?? option);
}

export function reviewCountLabel(count: number): string {
  return `${count.toLocaleString()} review${count === 1 ? "" : "s"}`;
}
