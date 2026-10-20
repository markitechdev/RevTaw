"use client";

import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * The hero line: types one phrase, holds it, backspaces it and types the next,
 * forever. It starts with the first phrase already written, so the headline is
 * readable at first paint (and without JavaScript); both phrases are rendered
 * invisibly underneath to reserve the space, so nothing shifts while typing.
 * Screen readers get the full text once (the animated copy is aria-hidden).
 * With reduced motion (device setting or Appearance) both phrases are shown,
 * no caret — CSS picks that version, so there is no swap after hydration.
 */
/** Zero-height box on the baseline: the bar inside is absolutely placed, so the caret never changes line heights. */
const CARET = "relative ml-[0.04em] inline-block h-0 w-[0.07em] align-baseline";
const CARET_BAR = "absolute -bottom-[0.14em] left-0 h-[0.9em] w-full rounded-full";

export function TypingHeadline({ phrases, className }: { phrases: readonly string[]; className?: string }) {
  const reduced = useReducedMotion();
  const [text, setText] = useState(phrases[0]);
  const [typing, setTyping] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reduced || phrases.length < 2) return;
    let index = 0;
    let shown = phrases[0];
    let timer: number | undefined;
    let visible = true;
    let cancelled = false;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = window.setTimeout(resolve, ms);
      });
    // Natural rhythm: a little jitter per key, a beat after spaces and punctuation.
    const keyDelay = (char: string) => 48 + Math.random() * 62 + (char === " " ? 40 : 0) + (/[.,!?]/.test(char) ? 140 : 0);

    const untilVisible = async () => {
      while (!visible && !cancelled) await wait(400);
    };

    const run = async () => {
      await wait(2200);
      while (!cancelled) {
        await untilVisible();
        // Backspace, quicker as it goes, like holding the key down.
        setTyping(true);
        const length = shown.length;
        for (let n = length - 1; n >= 0 && !cancelled; n -= 1) {
          shown = shown.slice(0, n);
          setText(shown);
          const deleted = length - n;
          await wait(deleted < 3 ? 90 : Math.max(22, 60 - deleted * 3));
        }
        await wait(320);
        index = (index + 1) % phrases.length;
        const next = phrases[index];
        for (let n = 1; n <= next.length && !cancelled; n += 1) {
          shown = next.slice(0, n);
          setText(shown);
          await wait(keyDelay(next[n - 1]));
        }
        setTyping(false);
        await wait(2600);
      }
    };

    const observer =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver((entries) => {
            visible = entries.some((entry) => entry.isIntersecting) && document.visibilityState === "visible";
          })
        : null;
    if (containerRef.current && observer) observer.observe(containerRef.current);
    const onVisibility = () => {
      visible = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVisibility);
    run();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced, phrases]);

  return (
    <span ref={containerRef} className={cn("relative block", className)}>
      <span className="sr-only">{phrases.join(" ")}</span>
      {/* Reduced motion: both lines, chosen by CSS so the first paint is already right. */}
      <span aria-hidden="true" className="hidden flex-col motion-reduce:flex [[data-motion=reduce]_&]:flex">
        {phrases.map((phrase, index) => (
          <span key={phrase} className={index > 0 ? "text-muted-foreground" : undefined}>
            {phrase}
          </span>
        ))}
      </span>
      <span className="grid motion-reduce:hidden [[data-motion=reduce]_&]:hidden" aria-hidden="true">
        {/* Invisible copies reserve the space of the longest phrase, caret included. */}
        {phrases.map((phrase) => (
          <span key={phrase} className="invisible col-start-1 row-start-1">
            {phrase}
            <span className={CARET} />
          </span>
        ))}
        <span className="col-start-1 row-start-1">
          {text}
          <span className={CARET}>
            <span className={cn(CARET_BAR, "bg-primary", !typing && "animate-caret")} />
          </span>
        </span>
      </span>
    </span>
  );
}
