"use client";

import { useSyncExternalStore } from "react";

const TICK_MS = 30_000;

// One timer for the whole app rather than one per card: an approvals list is
// the place most likely to hold a dozen of these at once.
let now = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (timer === null) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const notify of listeners) notify();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * A clock that components can read during render without calling `Date.now()`
 * themselves — which would be an impure read, and would also freeze: an
 * "expires in 4 min" label that never becomes "expires in 1 min" is worse
 * than no label at all.
 *
 * Returns 0 until the first subscription lands, on the server and through
 * hydration. Callers must treat 0 as "not known yet" and render nothing
 * time-relative, which keeps the server and client markup identical.
 */
export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => 0,
  );
}
