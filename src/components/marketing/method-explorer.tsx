"use client";

import { ArrowRight } from "lucide-react";
import { useState } from "react";

import { CHOICE_INPUT } from "@/components/ui/choice-input";
import { cn } from "@/lib/utils";

const METHODS = [
  {
    id: "active-recall",
    name: "Active Recall",
    change: "The answer stays hidden until you write yours.",
    then: "RevTaw lists what you got, what you missed and what was off — and files the misses for later.",
    when: "Best when you have to explain or define things.",
  },
  {
    id: "spaced-repetition",
    name: "Spaced Repetition",
    change: "Cards come back on a schedule, not all at once.",
    then: "A day later, then three, then a week — sooner when you miss one, later when it's easy.",
    when: "Best for terms, formulas and dates.",
  },
  {
    id: "feynman",
    name: "Feynman Technique",
    change: "You teach the idea to an imaginary beginner.",
    then: "RevTaw points out the gaps in your explanation, then shows a model explanation to compare.",
    when: "Best for concepts you only half understand.",
  },
  {
    id: "blurting",
    name: "Blurting",
    change: "Write everything you remember before looking.",
    then: "Then the source opens next to your blurt so you can see the holes and fill them.",
    when: "Best right after reading a chapter.",
  },
  {
    id: "pomodoro",
    name: "Pomodoro",
    change: "25 minutes of focus, then a 5-minute break.",
    then: "The timer survives a refresh, and your focus minutes count toward your streak.",
    when: "Best when starting is the hard part.",
  },
  {
    id: "practice-testing",
    name: "Practice Testing",
    change: "A timed test with no hints, like the real one.",
    then: "Your score and every mistake feed your mastery, so the next session targets what slipped.",
    when: "Best the week before an exam.",
  },
  {
    id: "interleaving",
    name: "Interleaving",
    change: "Questions from two or more subjects, mixed together.",
    then: "You practice telling problem types apart — the skill exams actually test.",
    when: "Best for math, physics and problem sets.",
  },
  {
    id: "memory-palace",
    name: "Memory Palace",
    change: "Concepts are placed along a route you know by heart.",
    then: "Walk the route from memory to recall them in order — RevTaw checks each stop.",
    when: "Best for long ordered lists.",
  },
] as const;

/** Study methods as a picker: choose one and see how it changes the session. */
export function MethodExplorer() {
  const [selected, setSelected] = useState<(typeof METHODS)[number]["id"]>("active-recall");
  const method = METHODS.find((item) => item.id === selected) ?? METHODS[0];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
      <fieldset>
        <legend className="sr-only">Pick a study method to see how it changes the session</legend>
        <div className="flex flex-wrap gap-2">
          {METHODS.map((item) => {
            const active = item.id === selected;
            return (
              <label
                key={item.id}
                className={cn(
                  "relative cursor-pointer select-none rounded-full border px-4 py-2 text-sm font-medium transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]",
                  "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-input",
                )}
              >
                <input type="radio" name="landing-method" value={item.id} checked={active} onChange={() => setSelected(item.id)} className={CHOICE_INPUT} />
                {item.name}
              </label>
            );
          })}
          <span className="px-2 py-2 text-sm text-muted-foreground">+ 30 more inside</span>
        </div>
      </fieldset>
      <div className="rounded-2xl border border-border bg-card p-5 sm:p-6" aria-live="polite">
        <div key={method.id} className="animate-fade-up">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{method.name}</p>
          <p className="mt-2 font-display tracking-display text-xl font-semibold leading-snug">{method.change}</p>
          <p className="mt-3 flex gap-2 text-sm text-muted-foreground">
            <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            {method.then}
          </p>
          <p className="mt-4 inline-block rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">{method.when}</p>
        </div>
      </div>
    </div>
  );
}
