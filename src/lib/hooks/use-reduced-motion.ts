"use client";

import { useSyncExternalStore } from "react";

/**
 * True when motion should be kept to a minimum: the device asks for it
 * (prefers-reduced-motion) or, inside the signed-in app, the student switched
 * it on in Appearance (data-motion="reduce" on <html>, set by the app frame;
 * public pages such as the landing page never carry it). False on the server,
 * so the first render matches; animations start only after hydration anyway.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", callback);
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  return () => {
    media.removeEventListener("change", callback);
    observer.disconnect();
  };
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches || document.documentElement.dataset.motion === "reduce";
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
