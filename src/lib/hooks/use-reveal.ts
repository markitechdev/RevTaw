"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll reveal for the `.reveal` class: elements already on screen are left
 * alone; the ones below the fold are hidden until they scroll into view.
 * Content stays visible without JavaScript and under reduced motion (CSS).
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const rect = element.getBoundingClientRect();
    if (rect.top < window.innerHeight) return;
    element.dataset.visible = "false";
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            element.dataset.visible = "true";
            observer.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return ref;
}
