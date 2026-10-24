"use client";

import { ArrowLeft, Lightbulb, RotateCcw, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { SessionSummaryCard } from "@/components/study/session-summary";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { finishReviewSessionAction, reviewCardAction, startReviewSessionAction, toggleFavoriteAction } from "@/lib/flashcards/actions";
import type { ReviewQueueCard } from "@/lib/flashcards/queries";
import { BOX_LABELS, RATING_LABELS, REPEAT_WITHIN_MINUTES } from "@/lib/flashcards/labels";
import { routes } from "@/lib/routes";
import type { SessionSummary } from "@/lib/study/sessions";
import type { FlashcardRating } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

const RATINGS: FlashcardRating[] = ["again", "hard", "good", "easy"];
const RATING_KEYS: Record<string, FlashcardRating> = { "1": "again", "2": "hard", "3": "good", "4": "easy" };
const MAX_REQUEUES = 3;

type QueueEntry = { card: ReviewQueueCard; requeues: number };

/**
 * Flashcard review runner: flip, rate (Don't know / Hard / Medium / Easy),
 * favorite, keyboard shortcuts. Every rating is saved immediately with its
 * FSRS schedule; a card due again within minutes ("Don't know", and a new
 * card's first learning steps) comes back later in the same session.
 */
export function FlashcardReview({
  queue,
  deckId,
  mode,
  backHref,
  backLabel,
  title,
  taskId = null,
}: {
  /** Already ordered (and shuffled when asked) by the server so hydration matches. */
  queue: ReviewQueueCard[];
  deckId: string | null;
  mode: "due" | "all" | "favorites";
  backHref: string;
  backLabel: string;
  /** The page's (visually hidden) h1, e.g. "Reviewing Biology deck". */
  title: string;
  /** Planner task this review completes, when started from the plan. */
  taskId?: string | null;
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<QueueEntry[]>(() => queue.map((card) => ({ card, requeues: 0 })));
  const [cards, setCards] = useState<Record<string, ReviewQueueCard>>(() => Object.fromEntries(queue.map((card) => [card.id, card])));
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [lastResult, setLastResult] = useState<{ rating: FlashcardRating; box: number; wait: string; repeat: boolean } | null>(null);
  const [progress, setProgress] = useState({ reviewed: 0, again: 0, promoted: 0 });

  // Per-concept tallies and timing only matter in event handlers, so they live in refs.
  const conceptStats = useRef(new Map<string, { again: number; total: number }>());
  const nextDue = useRef<string | null>(null);
  const startedAt = useRef<number>(0);
  const shownAt = useRef<number>(0);
  // The initial queue is the session's universe; later server refreshes must not reset it.
  const [total] = useState(queue.length);

  const entry = entries[0];
  const card = entry ? cards[entry.card.id] : null;
  const reviewedCount = progress.reviewed;

  // Open a session row once; the server stores every rating against it.
  useEffect(() => {
    startedAt.current = Date.now();
    if (queue.length === 0) return;
    let cancelled = false;
    startReviewSessionAction({ deckId, mode, cardCount: queue.length, taskId }).then((result) => {
      if (!cancelled && result.ok) setSessionId(result.data.sessionId);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [card?.id, entries.length]);

  const finishWith = useCallback(
    (current: { reviewed: number; again: number; promoted: number }) => {
      if (finishing) return;
      setFinishing(true);
      const byConcept = conceptStats.current;
      const weak = [...byConcept.entries()].filter(([, value]) => value.again > 0).map(([name]) => name);
      const strong = [...byConcept.entries()].filter(([, value]) => value.again === 0 && value.total > 0).map(([name]) => name);
      startTransition(async () => {
        if (!sessionId) {
          setSummary({
            durationSeconds: Math.round((Date.now() - startedAt.current) / 1000),
            topics: [...byConcept.keys()],
            questionsAnswered: current.reviewed,
            correct: current.reviewed - current.again,
            incorrect: current.again,
            accuracy: current.reviewed ? (current.reviewed - current.again) / current.reviewed : null,
            improvement: null,
            weakConcepts: weak,
            strongConcepts: strong,
            masteredConcepts: [],
            suggestedNext: current.reviewed === 0 ? "Nothing was reviewed." : "Come back when the next cards are due.",
            nextReviewAt: nextDue.current,
          });
          return;
        }
        const result = await finishReviewSessionAction({
          sessionId,
          focusSeconds: Math.round((Date.now() - startedAt.current) / 1000),
          reviewed: current.reviewed,
          again: current.again,
          topics: [...byConcept.keys()].slice(0, 30),
          weakConcepts: weak.slice(0, 20),
          strongConcepts: strong.slice(0, 20),
          nextReviewAt: nextDue.current,
        });
        if (!result.ok) {
          setError(result.message);
          setFinishing(false);
          return;
        }
        setSummary(result.data);
        router.refresh();
      });
    },
    [finishing, sessionId, router],
  );

  const finish = useCallback(() => finishWith(progress), [finishWith, progress]);

  const rate = useCallback(
    (rating: FlashcardRating) => {
      if (!card || !entry || pending) return;
      setError(null);
      const responseMs = Math.min(86_400_000, Date.now() - shownAt.current);
      startTransition(async () => {
        const result = await reviewCardAction({ cardId: card.id, rating, responseMs, sessionId });
        if (!result.ok) {
          setError(result.message);
          return;
        }
        const first = entry.requeues === 0;
        if (first) {
          const concept = card.concept?.name ?? card.deck.title;
          const tally = conceptStats.current.get(concept) ?? { again: 0, total: 0 };
          tally.total += 1;
          if (rating === "again") tally.again += 1;
          conceptStats.current.set(concept, tally);
        }
        const soon = new Date(result.data.dueAt).getTime() - Date.now() <= REPEAT_WITHIN_MINUTES * 60_000;
        const repeat = soon && entry.requeues < MAX_REQUEUES;
        if (!repeat && (!nextDue.current || result.data.dueAt < nextDue.current)) nextDue.current = result.data.dueAt;
        const nextProgress = {
          reviewed: progress.reviewed + (first ? 1 : 0),
          again: progress.again + (first && rating === "again" ? 1 : 0),
          promoted: progress.promoted + (result.data.box > card.box ? 1 : 0),
        };
        const rest = entries.slice(1);
        const nextEntries =
          repeat
            ? (() => {
                const position = Math.min(rest.length, Math.max(2, Math.floor(rest.length / 2)));
                return [...rest.slice(0, position), { card, requeues: entry.requeues + 1 }, ...rest.slice(position)];
              })()
            : rest;
        setProgress(nextProgress);
        setLastResult({ rating, box: result.data.box, wait: result.data.wait, repeat });
        setFlipped(false);
        setShowHint(false);
        setCards((state) => ({
          ...state,
          [card.id]: { ...card, box: result.data.box, interval_days: result.data.intervalDays, due_at: result.data.dueAt, repetitions: card.repetitions + 1, waits: result.data.waits },
        }));
        setEntries(nextEntries);
        if (nextEntries.length === 0) finishWith(nextProgress);
      });
    },
    [card, entry, entries, pending, sessionId, progress, finishWith],
  );

  // Keyboard: Space/Enter flips, 1-4 rate, F favorites, H hint.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!card || summary) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(target.tagName) && event.key !== " ") return;
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        setFlipped((value) => !value);
      } else if (flipped && RATING_KEYS[event.key]) {
        event.preventDefault();
        rate(RATING_KEYS[event.key]);
      } else if (event.key.toLowerCase() === "h") {
        setShowHint(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [card, flipped, rate, summary]);

  const toggleFavorite = () => {
    if (!card) return;
    const next = !card.favorite;
    setCards((state) => ({ ...state, [card.id]: { ...card, favorite: next } }));
    toggleFavoriteAction(card.id, next).then((result) => {
      if (!result.ok) setError(result.message);
    });
  };

  if (summary) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="sr-only">{title}</h1>
        <Link href={backHref} className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-2 self-start" })}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel}
        </Link>
        <SessionSummaryCard
          title="Review complete"
          summary={summary}
          extraStats={[{ label: "Moved up a box", value: String(progress.promoted) }]}
          actions={
            <>
              <Link href={backHref} className={buttonClasses({ size: "sm" })}>
                {backLabel}
              </Link>
              <Button type="button" size="sm" variant="secondary" onClick={() => router.refresh()}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Review again
              </Button>
            </>
          }
        />
      </div>
    );
  }

  if (queue.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="sr-only">{title}</h1>
        <Link href={backHref} className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-2 self-start" })}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel}
        </Link>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center">
          <div>
            <p className="font-medium">{mode === "due" ? "Nothing is due right now" : mode === "favorites" ? "No favorite cards yet" : "This deck has no cards"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "due"
                ? deckId
                  ? "Spaced repetition only shows cards when it is time. Study the whole deck if you want extra practice."
                  : "Spaced repetition only shows cards when it is time. Pick a deck to study it all for extra practice."
                : "Mark cards with the star while reviewing to collect them here."}
            </p>
          </div>
          {/* Somewhere to go instead of a dead end. */}
          {mode !== "all" && (
            <Link href={deckId ? `${routes.flashcards}/${deckId}/review?mode=all` : routes.flashcards} className={buttonClasses({ size: "sm" })}>
              {deckId ? "Study all cards" : "Pick a deck"}
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (!card || !entry) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Saving your session…
      </p>
    );
  }

  const percent = Math.min(100, Math.round((reviewedCount / Math.max(1, total)) * 100));
  const repeats = Math.max(0, entries.length - (total - reviewedCount));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">{title}</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-2" })}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {backLabel}
        </Link>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>
            {reviewedCount} / {total} reviewed
            {repeats > 0 ? ` · ${repeats} to repeat` : ""}
          </span>
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={finish}>
            End review
          </Button>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Review progress">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="neutral">
            Box {card.box} · {BOX_LABELS[card.box]}
          </Badge>
          {card.concept && <Badge tone="primary">{card.concept.name}</Badge>}
          {!deckId && <span className="text-muted-foreground">{card.deck.title}</span>}
          {entry.requeues > 0 && <Badge tone="warning">Repeat</Badge>}
          <button
            type="button"
            onClick={toggleFavorite}
            aria-pressed={card.favorite}
            aria-label={card.favorite ? "Remove from favorites" : "Add to favorites"}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Star className={cn("h-4 w-4", card.favorite && "fill-warning text-warning")} aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setFlipped((value) => !value)}
          className={cn(
            "flex min-h-64 w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border bg-card p-8 text-center shadow-sm transition-colors",
            flipped ? "border-primary/50 bg-primary-soft/30" : "border-border hover:border-primary/40",
          )}
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{flipped ? "Answer" : "Question"}</span>
          <span className="whitespace-pre-wrap text-xl font-medium leading-snug text-foreground">{flipped ? card.back : card.front}</span>
          {flipped && card.source_excerpt && <span className="mt-2 text-xs italic text-muted-foreground">Source: “{card.source_excerpt}”</span>}
          <span className="mt-2 text-xs text-muted-foreground">{flipped ? "Tap or press Space to show the question again" : "Tap or press Space to reveal"}</span>
        </button>

        {!flipped && card.hint && (
          <div className="flex justify-center">
            {showHint ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Lightbulb className="h-4 w-4 text-warning" aria-hidden="true" />
                {card.hint}
              </p>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowHint(true)}>
                <Lightbulb className="h-4 w-4" aria-hidden="true" />
                Show hint
              </Button>
            )}
          </div>
        )}

        {flipped ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Rate your recall">
            {RATINGS.map((rating, index) => (
              <button
                key={rating}
                type="button"
                disabled={pending}
                onClick={() => rate(rating)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-xl border px-3 py-3 text-sm font-medium transition-colors disabled:opacity-60",
                  rating === "again" && "border-danger/40 bg-danger-soft/50 text-danger hover:bg-danger-soft",
                  rating === "hard" && "border-warning/40 bg-warning-soft/50 text-warning hover:bg-warning-soft",
                  rating === "good" && "border-primary/40 bg-primary-soft/60 text-primary hover:bg-primary-soft",
                  rating === "easy" && "border-success/40 bg-success-soft/50 text-success hover:bg-success-soft",
                )}
              >
                <span>
                  <kbd className="mr-1 rounded border border-current/30 px-1 text-[10px]">{index + 1}</kbd>
                  {RATING_LABELS[rating].label}
                </span>
                <span className="text-xs font-normal opacity-80">{card.waits[rating]}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex justify-center">
            <Button type="button" onClick={() => setFlipped(true)}>
              Reveal answer
            </Button>
          </div>
        )}

        {lastResult && !flipped && (
          <p className="text-center text-xs text-muted-foreground" role="status">
            Last card: {RATING_LABELS[lastResult.rating].label} → box {lastResult.box}
            {lastResult.repeat ? ", shown again later in this review" : `, next review in ${lastResult.wait}`}
          </p>
        )}
      </div>
    </div>
  );
}
