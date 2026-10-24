"use client";

import { useEffect, useRef, useState } from "react";

import { useLandingMotionPaused } from "@/components/marketing/motion-toggle";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * The hero line: types one phrase, holds it, backspaces it and types the next,
 * forever. It starts with the first phrase already written, so the headline is
 * readable at first paint (and without JavaScript); both phrases are rendered
 * invisibly underneath to reserve the space, so nothing shifts while typing.
 * Screen readers get the full text once (the animated copy is aria-hidden).
 * With reduced motion (the device's setting; the app's Reduce motion stays in
 * the app) both phrases are shown, no caret — CSS picks that version, so there
 * is no swap after hydration. "Pause animation" (MotionToggle) stops it on a
 * whole phrase.
 */
/** Zero-height box on the baseline: the bar inside is absolutely placed, so the caret never changes line heights. */
const CARET = "relative ml-[0.04em] inline-block h-0 w-[0.07em] align-baseline";
const CARET_BAR = "absolute -bottom-[0.14em] left-0 h-[0.9em] w-full rounded-full";

export function TypingHeadline({ phrases, langs = [], className }: { phrases: readonly string[]; /** Each phrase's language, when it is not the page's (the Filipino motto). */ langs?: ReadonlyArray<string | undefined>; className?: string }) {
  const reduced = useReducedMotion();
  const [text, setText] = useState(phrases[0]);
  const [typing, setTyping] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const paused = useLandingMotionPaused();
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

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

    const untilReady = async () => {
      while ((!visible || pausedRef.current) && !cancelled) await wait(400);
    };
    /** Paused mid-word: the whole phrase comes back at once and the loop waits. */
    const settle = (phrase: string) => {
      shown = phrase;
      setText(phrase);
      setTyping(false);
    };

    const run = async () => {
      await wait(2200);
      while (!cancelled) {
        await untilReady();
        // Backspace, quicker as it goes, like holding the key down.
        setTyping(true);
        const length = shown.length;
        const deleting = phrases[index];
        for (let n = length - 1; n >= 0 && !cancelled && !pausedRef.current; n -= 1) {
          shown = shown.slice(0, n);
          setText(shown);
          const deleted = length - n;
          await wait(deleted < 3 ? 90 : Math.max(22, 60 - deleted * 3));
        }
        if (pausedRef.current) {
          settle(deleting);
          continue;
        }
        await wait(320);
        index = (index + 1) % phrases.length;
        const next = phrases[index];
        for (let n = 1; n <= next.length && !cancelled && !pausedRef.current; n += 1) {
          shown = next.slice(0, n);
          setText(shown);
          await wait(keyDelay(next[n - 1]));
        }
        if (pausedRef.current) {
          settle(next);
          continue;
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
      <span className="sr-only">
        {phrases.map((phrase, index) => (
          <span key={phrase} lang={langs[index]}>
            {index > 0 ? " " : ""}
            {phrase}
          </span>
        ))}
      </span>
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
