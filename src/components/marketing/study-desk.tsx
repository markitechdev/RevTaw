"use client";

import { Check, Flame, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * The hero's "study desk": three small, real interactions instead of a
 * screenshot — a flashcard that flips, a quiz question you can answer and a
 * mastery widget that fills up. The desk leans a few pixels toward the
 * pointer (transform only, mouse only, off under reduced motion).
 */
export function StudyDesk() {
  const deskRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const desk = deskRef.current;
    if (!desk || reduced || window.matchMedia("(pointer: coarse)").matches) return;
    const area = desk.closest("section") ?? desk;
    let frame = 0;
    const onMove = (event: Event) => {
      const pointer = event as PointerEvent;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = desk.getBoundingClientRect();
        const x = (pointer.clientX - (rect.left + rect.width / 2)) / window.innerWidth;
        const y = (pointer.clientY - (rect.top + rect.height / 2)) / window.innerHeight;
        desk.style.setProperty("--lean-x", Math.max(-1, Math.min(1, x * 2)).toFixed(3));
        desk.style.setProperty("--lean-y", Math.max(-1, Math.min(1, y * 2)).toFixed(3));
      });
    };
    const onLeave = () => {
      desk.style.setProperty("--lean-x", "0");
      desk.style.setProperty("--lean-y", "0");
    };
    area.addEventListener("pointermove", onMove);
    area.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      area.removeEventListener("pointermove", onMove);
      area.removeEventListener("pointerleave", onLeave);
    };
  }, [reduced]);

  const layer = (depth: number): CSSProperties => ({
    transform: `translate3d(calc(var(--lean-x, 0) * ${depth}px), calc(var(--lean-y, 0) * ${depth}px), 0)`,
    transition: "transform 400ms var(--ease-out)",
  });

  return (
    <div ref={deskRef} className="relative mx-auto grid w-full max-w-md gap-4 sm:max-w-lg">
      <div style={layer(10)}>
        <FlashcardDemo />
      </div>
      <div className="grid gap-4 sm:grid-cols-[1.15fr_1fr]">
        <div style={layer(16)}>
          <QuizDemo />
        </div>
        <div style={layer(7)}>
          <MasteryDemo />
        </div>
      </div>
    </div>
  );
}

function FlashcardDemo() {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className="[perspective:1200px]">
      <button
        type="button"
        onClick={() => setFlipped((value) => !value)}
        aria-pressed={flipped}
        className="group relative block h-44 w-full cursor-pointer rounded-2xl text-left [transform-style:preserve-3d] transition-transform duration-500 ease-out sm:-rotate-[1.5deg]"
        style={{ transform: flipped ? "rotateY(180deg)" : undefined }}
      >
        <span className="sr-only">{flipped ? "Flashcard, answer side. Press to show the question." : "Flashcard, question side. Press to flip."}</span>
        <span
          aria-hidden={flipped}
          className="paper-lines absolute inset-0 flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-md [backface-visibility:hidden]"
        >
          <span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Biology · Card 3 of 12</span>
            <span className="rounded-full bg-highlight px-2 py-0.5 text-highlight-foreground">Box 2</span>
          </span>
          <span className="font-display text-xl font-semibold leading-snug text-foreground">What does chlorophyll absorb best?</span>
          <span className="text-xs text-muted-foreground group-hover:text-primary">Tap to flip</span>
        </span>
        <span
          aria-hidden={!flipped}
          className="absolute inset-0 flex flex-col justify-between rounded-2xl border border-primary/40 bg-primary-soft p-5 shadow-md [backface-visibility:hidden] [transform:rotateY(180deg)]"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">Answer</span>
          <span className="font-display text-xl font-semibold leading-snug text-foreground">Red and blue light — it reflects green, which is why leaves look green.</span>
          <span className="text-xs text-primary">How well did you know it? Again · Hard · Good · Easy</span>
        </span>
      </button>
    </div>
  );
}

const OPTIONS = [
  { id: "a", label: "Light-dependent reactions", correct: false, note: "Close — those make ATP and NADPH for the next stage." },
  { id: "b", label: "The Calvin cycle", correct: true, note: "Bitaw! It fixes CO₂ into sugar using that ATP." },
  { id: "c", label: "Glycolysis", correct: false, note: "That one breaks glucose down — it happens in cell respiration." },
] as const;

function QuizDemo() {
  const [picked, setPicked] = useState<(typeof OPTIONS)[number]["id"] | null>(null);
  const choice = OPTIONS.find((option) => option.id === picked) ?? null;
  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-md sm:rotate-[1deg]">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Quiz · Question 4</p>
      <p id="demo-question" className="text-sm font-semibold leading-snug text-foreground">
        Which stage of photosynthesis makes glucose?
      </p>
      <div role="group" aria-labelledby="demo-question" className="flex flex-col gap-1.5">
        {OPTIONS.map((option) => {
          const chosen = picked === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={chosen}
              disabled={choice?.correct && !chosen}
              onClick={() => setPicked(option.id)}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-[background-color,border-color,transform] duration-150 active:scale-[0.98] disabled:cursor-default disabled:opacity-60",
                chosen && option.correct && "border-success bg-success-soft text-success",
                chosen && !option.correct && "border-danger bg-danger-soft text-danger",
                !chosen && "border-border bg-card text-foreground hover:border-input",
              )}
            >
              <span>
                <span className="mr-2 font-semibold uppercase text-muted-foreground">{option.id}</span>
                {option.label}
              </span>
              {chosen && (option.correct ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <X className="h-4 w-4 shrink-0" aria-hidden="true" />)}
            </button>
          );
        })}
      </div>
      <p className="min-h-[3.25rem] text-xs text-muted-foreground" role="status">
        {choice ? (
          <>
            <span className={cn("font-semibold", choice.correct ? "text-success" : "text-danger")}>{choice.correct ? "Correct. " : "Not quite. "}</span>
            {choice.note}
            {!choice.correct && (
              <button type="button" onClick={() => setPicked(null)} className="ml-1 inline-flex cursor-pointer items-center gap-1 font-medium text-primary hover:underline">
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                Try again
              </button>
            )}
          </>
        ) : (
          "Pick an answer — RevTaw explains either way."
        )}
      </p>
    </div>
  );
}

const CONCEPTS = [
  { name: "Chlorophyll", value: 86, tone: "bg-success" },
  { name: "Calvin cycle", value: 64, tone: "bg-info" },
  { name: "ATP synthase", value: 38, tone: "bg-warning" },
] as const;

function MasteryDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [filled, setFilled] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      const frame = requestAnimationFrame(() => setFilled(true));
      return () => cancelAnimationFrame(frame);
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setFilled(true);
        observer.disconnect();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-md sm:-rotate-[1deg]">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Mastery</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">
          <Flame className="h-3 w-3" aria-hidden="true" />5-day streak
        </span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {CONCEPTS.map((concept) => (
          <li key={concept.name} className="flex flex-col gap-1">
            <span className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">{concept.name}</span>
              <span className="tabular-nums text-muted-foreground">{concept.value}%</span>
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${concept.name} mastery`} aria-valuenow={concept.value} aria-valuemin={0} aria-valuemax={100}>
              <span
                className={cn("block h-full origin-left rounded-full transition-transform duration-1000 ease-out", concept.tone)}
                style={{ width: `${concept.value}%`, transform: filled ? "scaleX(1)" : "scaleX(0)" }}
              />
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-auto rounded-lg bg-muted px-2.5 py-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">12 cards</span> due today · about 9 min
      </p>
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">ATP synthase</span> comes back tomorrow.
      </p>
    </div>
  );
}
