"use client";

import { useSyncExternalStore } from "react";

/**
 * A clock that ticks once a second and is `null` on the server and while
 * hydrating. Rendering a countdown from `Date.now()` straight away produces
 * a different string on the server and the client whenever a second passes
 * between the two, which React reports as a hydration mismatch; reading the
 * time through an external store lets React render the server snapshot
 * (nothing) first and the real time right after.
 */

const listeners = new Set<() => void>();
let snapshot = 0;
let interval: number | null = null;

function tick() {
  snapshot = Date.now();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (interval === null) {
    snapshot = Date.now();
    interval = window.setInterval(tick, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && interval !== null) {
      window.clearInterval(interval);
      interval = null;
    }
  };
}

function getSnapshot(): number {
  if (snapshot === 0) snapshot = Date.now();
  return snapshot;
}

function getServerSnapshot(): null {
  return null;
}

export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
