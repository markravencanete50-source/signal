"use client";

import { useSyncExternalStore } from "react";

/**
 * True once the component is running in the browser, false during SSR and the
 * hydration pass. The `useSyncExternalStore` form is React's sanctioned
 * hydration detector: the server snapshot is `false`, the client snapshot is
 * `true`, and the switch happens without effects or setState — which also
 * keeps the strict no-setState-in-effect lint rule satisfied.
 *
 * Use it to gate anything that depends on the USER'S clock or timezone: the
 * serverless render clock is UTC, so any date maths done during SSR would
 * disagree with what the browser computes for everyone east or west of it.
 */
const subscribe = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
