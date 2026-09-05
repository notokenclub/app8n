"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribes to a CSS media query.
 *
 * `useSyncExternalStore` rather than state-plus-effect: `matchMedia` is
 * exactly the external store this hook exists for, and it gives React a
 * separate server snapshot instead of producing a render, a mismatch and then
 * a correction.
 *
 * The server snapshot is `false` on purpose. Mobile is the primary target, so
 * the phone layout is what gets painted first and a phone never flashes the
 * desktop chrome before settling.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Matches Tailwind's `md` breakpoint — where the sidebar replaces the tabs. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}
