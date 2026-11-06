"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False on the server and during the first client render, true afterwards. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
