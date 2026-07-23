"use client";

import { useSyncExternalStore } from "react";

/**
 * Used to pick between the desktop 3-column layout and the mobile
 * stacked/sheet layout (see DESIGN_PROMPT.md's mobile requirement) as an
 * actual conditional render, not just a CSS `hidden`/`block` toggle - two
 * things in particular can't safely double-mount: a Leaflet MapContainer
 * (breaks on a zero-size hidden container) and two InstantSearch hits
 * connectors independently paginating the same query.
 *
 * `useSyncExternalStore` keeps this hydration-safe: the server snapshot
 * intentionally defaults to the mobile layout (`false`) since there's no
 * viewport to check on the server, then it corrects on the client's first
 * effect flush without a hydration mismatch warning.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}
