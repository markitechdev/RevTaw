"use client";

import { useCallback, useInsertionEffect, useRef } from "react";

/**
 * One function identity for the life of the component that always runs the
 * latest version passed in. For handlers given to memoized children (a list
 * of chat messages, say), so a parent re-rendering for a keystroke does not
 * make every child re-render too. Not for use during render: like
 * useEffectEvent, the latest version is only in place after commit.
 */
export function useStableCallback<Args extends unknown[], Result>(callback: (...args: Args) => Result): (...args: Args) => Result {
  const latest = useRef(callback);
  useInsertionEffect(() => {
    latest.current = callback;
  });
  return useCallback((...args: Args) => latest.current(...args), []);
}
