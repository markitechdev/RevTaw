"use client";

import { CheckCircle2, CircleDashed, FileText, Sparkles, XCircle } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { ANSWER_LEVELS, AnswerOvals } from "@/components/marketing/answer-sheet";
import { cn } from "@/lib/utils";

type Step = { id: string; label: string; title: string; body: string; preview: ReactNode };

const STEPS: Step[] = [
  {
    id: "upload",
    label: "Upload",
    title: "Drop in what your teacher gave you.",
    body: "A PDF, a Word file, a photo of the whiteboard or notes you paste. RevTaw reads it and finds the topics, the terms and the likely exam points.",
    preview: <UploadPreview />,
  },
  {
    id: "study",
    label: "Study",
    title: "Pick a method — or let RevTaw pick.",
    body: "Each method changes the session: what you see first, when the answer appears, what comes back later. RevTaw recommends one from how you're doing.",
    preview: <StudyPreview />,
  },
  {
    id: "recall",
    label: "Recall",
    title: "Answer first. Then compare.",
    body: "Write what you remember before seeing anything. RevTaw shows what you got, what you missed and what was wrong — misses go to your mistake notebook.",
    preview: <RecallPreview />,
  },
  {
    id: "master",
    label: "Master",
    title: "Weak spots come back. Strong ones space out.",
    body: "Every answer updates your mastery per concept, so reviews land right before you'd forget — and you can see which topics are exam-ready.",
    preview: <MasterPreview />,
  },
];

/** "How RevTaw works" as tabs: a short step list with a live preview of each step. */
export function HowItWorks() {
  const [active, setActive] = useState(0);
  const baseId = useId();
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusTab = (index: number) => {
    const next = (index + STEPS.length) % STEPS.length;
    setActive(next);
    tabs.current[next]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusTab(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusTab(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusTab(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusTab(STEPS.length - 1);
    }
  };

  const step = STEPS[active];
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
      <div role="tablist" aria-label="How RevTaw works" aria-orientation="vertical" className="flex flex-col gap-1">
        {STEPS.map((item, index) => {
          const selected = index === active;
          return (
            <button
              key={item.id}
              ref={(node) => {
                tabs.current[index] = node;
              }}
              id={`${baseId}-tab-${item.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                "group flex cursor-pointer gap-4 rounded-xl border-l-4 px-4 py-3 text-left transition-[background-color,border-color] duration-200",
                selected ? "border-primary bg-card" : "border-transparent hover:bg-card/60",
              )}
            >
              <span className={cn("font-display tracking-display text-2xl font-bold tabular-nums", selected ? "text-primary" : "text-muted-foreground")} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{item.label}</span>
                <span className="font-semibold text-foreground">{item.title}</span>
                <span className={cn("text-sm text-muted-foreground", !selected && "hidden sm:line-clamp-1")}>{item.body}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${step.id}`} className="min-h-[19rem] rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div key={step.id} className="animate-fade-up">
          {step.preview}
        </div>
      </div>
    </div>
  );
}

function PreviewLabel({ children }: { children: ReactNode }) {
  return <p className="mb-4 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>;
}

function UploadPreview() {
  return (
    <div>
      <PreviewLabel>Materials</PreviewLabel>
      <div className="flex items-center gap-3 rounded-xl border border-border p-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <FileText className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Bio 101 — Photosynthesis.pdf</p>
          <p className="text-xs text-muted-foreground">12 pages · analyzed in 18 seconds</p>
        </div>
        <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs font-semibold text-success">Ready</span>
      </div>
      <p className="mt-5 text-sm font-medium">Found in your file</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {["Chlorophyll", "Light-dependent reactions", "Calvin cycle", "ATP & NADPH", "Stomata", "Glucose"].map((term) => (
          <li key={term} className="rounded-full border border-border px-3 py-1 text-xs font-medium">
            {term}
          </li>
        ))}
      </ul>
      <p className="mt-5 text-sm text-muted-foreground">
        <span className="highlighter text-foreground">Likely exam point:</span> the two stages and what each one produces.
      </p>
    </div>
  );
}

function StudyPreview() {
  const methods = [
    { name: "Active Recall", note: "Answers stay hidden until you write yours.", recommended: true },
    { name: "Spaced Repetition", note: "12 cards are due today.", recommended: false },
    { name: "Feynman Technique", note: "Explain it like you're teaching a friend.", recommended: false },
  ];
  return (
    <div>
      <PreviewLabel>Start a session · 25 minutes</PreviewLabel>
      <ul className="flex flex-col gap-2">
        {methods.map((method) => (
          <li key={method.name} className={cn("flex items-start gap-3 rounded-xl border p-3", method.recommended ? "border-primary bg-primary-soft" : "border-border")}>
            <span className={cn("mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2", method.recommended ? "border-primary bg-primary" : "border-input")} aria-hidden="true" />
            <span className="flex flex-col">
              <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                {method.name}
                {method.recommended && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-highlight px-2 py-0.5 text-2xs font-semibold text-highlight-foreground">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    Picked for you
                  </span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">{method.note}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">Why this one? Calvin cycle is at 38% and you missed it twice this week.</p>
    </div>
  );
}

function RecallPreview() {
  return (
    <div>
      <PreviewLabel>Active recall · 3 of 8</PreviewLabel>
      <p className="font-semibold">What are the two products of the light-dependent reactions?</p>
      <p className="mt-3 rounded-xl border border-border bg-muted/50 p-3 text-sm italic text-muted-foreground">“ATP and oxygen… I think. Also water?”</p>
      <ul className="mt-4 flex flex-col gap-2 text-sm">
        <li className="flex items-center gap-2 text-success">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> ATP — you got it
        </li>
        <li className="flex items-center gap-2 text-warning">
          <CircleDashed className="h-4 w-4" aria-hidden="true" /> NADPH — missing
        </li>
        <li className="flex items-center gap-2 text-danger">
          <XCircle className="h-4 w-4" aria-hidden="true" /> Water is used, not produced
        </li>
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">Saved to your mistake notebook — it comes back in your next review.</p>
    </div>
  );
}

/** Topic | ovals (label under the topic on phones) | label on wider screens. */
const SHEET_COLUMNS = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 sm:grid-cols-[minmax(0,1fr)_auto_4.75rem]";

function MasterPreview() {
  const rows = [
    { name: "Chlorophyll", level: 5, label: "Mastered" },
    { name: "Light-dependent reactions", level: 4, label: "Strong" },
    { name: "Calvin cycle", level: 3, label: "Learning" },
    { name: "ATP synthase", level: 1, label: "Weak" },
  ];
  return (
    <div>
      <PreviewLabel>Mastery · Biology midterm in 6 days</PreviewLabel>
      <div aria-hidden="true" className={cn(SHEET_COLUMNS, "px-2 pb-1.5")}>
        <span className="col-start-2 flex gap-1.5">
          {ANSWER_LEVELS.map((level) => (
            <span key={level} className="w-5 text-center text-2xs font-semibold tabular-nums text-primary">
              {level}
            </span>
          ))}
        </span>
      </div>
      <ul>
        {rows.map((row, rowIndex) => (
          <li key={row.name} className={cn(SHEET_COLUMNS, "gap-y-0.5 border-t border-border px-2 py-2.5")}>
            <span className="col-start-1 row-start-1 text-sm font-medium">
              {row.name}
              <span className="sr-only">: level {row.level} of 5,</span>
            </span>
            <AnswerOvals level={row.level} delay={rowIndex * 110} className="col-start-2 row-span-2 row-start-1 sm:row-span-1" />
            <span className="col-start-1 row-start-2 text-xs font-medium text-muted-foreground sm:col-start-3 sm:row-start-1 sm:text-right">
              {row.level === 1 ? <span className="highlighter -mx-[0.1em] text-foreground">{row.label}</span> : row.label}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-foreground">Next review: ATP synthase tomorrow, Calvin cycle on Friday.</p>
    </div>
  );
}
