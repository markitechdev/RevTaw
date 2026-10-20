"use client";

import { Check, Pencil, Star, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { toggleFavoriteAction, updateCardAction } from "@/lib/flashcards/actions";
import type { CardView } from "@/lib/flashcards/queries";
import { BOX_LABELS } from "@/lib/flashcards/scheduler";
import { useNow } from "@/lib/hooks/use-now";
import { cn } from "@/lib/utils";

const BOX_TONES: Record<number, "danger" | "warning" | "neutral" | "primary" | "success"> = { 1: "danger", 2: "warning", 3: "neutral", 4: "primary", 5: "success" };

function dueLabel(card: CardView, now: number): string {
  if (card.suspended) return "Suspended";
  const due = new Date(card.due_at).getTime();
  const diff = due - now;
  if (diff <= 0) return "Due now";
  const days = Math.ceil(diff / 86_400_000);
  return days === 1 ? "Due tomorrow" : `Due in ${days} days`;
}

/** Editable list of a deck's cards with box, due date and favorite. */
export function CardList({ cards, renderedAt }: { cards: CardView[]; /** Server time of the read (ISO), so "due in N days" hydrates identically; the live clock takes over afterwards. */ renderedAt: string }) {
  const router = useRouter();
  const now = useNow() ?? new Date(renderedAt).getTime();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ front: "", back: "", hint: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const startEdit = (card: CardView) => {
    setEditing(card.id);
    setDraft({ front: card.front, back: card.back, hint: card.hint ?? "" });
    setError(null);
  };

  const save = (card: CardView, suspended?: boolean) => {
    startTransition(async () => {
      const result = await updateCardAction({ cardId: card.id, front: draft.front, back: draft.back, hint: draft.hint || null, suspended });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  };

  const favorite = (card: CardView) => {
    startTransition(async () => {
      const result = await toggleFavoriteAction(card.id, !card.favorite);
      if (!result.ok) setError(result.message);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {error && <Alert tone="error">{error}</Alert>}
      <ol className="flex flex-col gap-2">
        {cards.map((card) => (
          <li key={card.id} className={cn("rounded-xl border border-border bg-card p-4", card.suspended && "opacity-60")}>
            {editing === card.id ? (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium" htmlFor={`front-${card.id}`}>
                  Front
                </label>
                <Textarea id={`front-${card.id}`} rows={2} value={draft.front} maxLength={2000} onChange={(event) => setDraft({ ...draft, front: event.target.value })} />
                <label className="text-xs font-medium" htmlFor={`back-${card.id}`}>
                  Back
                </label>
                <Textarea id={`back-${card.id}`} rows={3} value={draft.back} maxLength={4000} onChange={(event) => setDraft({ ...draft, back: event.target.value })} />
                <label className="text-xs font-medium" htmlFor={`hint-${card.id}`}>
                  Hint (optional)
                </label>
                <Input id={`hint-${card.id}`} value={draft.hint} maxLength={500} onChange={(event) => setDraft({ ...draft, hint: event.target.value })} />
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => save(card, !card.suspended)}>
                    {card.suspended ? "Resume card" : "Suspend card"}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setEditing(null)}>
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    Cancel
                  </Button>
                  <Button type="button" size="sm" loading={pending} onClick={() => save(card)}>
                    {!pending && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-muted-foreground">#{card.position + 1}</span>
                  <Badge tone={BOX_TONES[card.box] ?? "neutral"}>
                    Box {card.box} · {BOX_LABELS[card.box]}
                  </Badge>
                  {card.concept && <Badge tone="primary">{card.concept.name}</Badge>}
                  <span className="text-muted-foreground">{dueLabel(card, now)}</span>
                  {card.lapses > 0 && <span className="text-muted-foreground">· {card.lapses} lapse{card.lapses === 1 ? "" : "s"}</span>}
                  <span className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => favorite(card)}
                      aria-pressed={card.favorite}
                      aria-label={card.favorite ? "Remove from favorites" : "Add to favorites"}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Star className={cn("h-4 w-4", card.favorite && "fill-warning text-warning")} aria-hidden="true" />
                    </button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => startEdit(card)} aria-label={`Edit card ${card.position + 1}`}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      Edit
                    </Button>
                  </span>
                </div>
                <p className="whitespace-pre-wrap font-medium">{card.front}</p>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{card.back}</p>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Leitner box distribution bar. */
export function BoxBar({ boxes, compact = false }: { boxes: number[]; compact?: boolean }) {
  const total = boxes.reduce((sum, count) => sum + count, 0);
  const tones = ["bg-danger", "bg-warning", "bg-muted-foreground/60", "bg-primary", "bg-success"];
  return (
    <div className={cn("flex flex-col gap-1", compact ? "text-[11px]" : "text-xs")}>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={boxes.map((count, index) => `${BOX_LABELS[index + 1]}: ${count}`).join(", ")}>
        {boxes.map((count, index) =>
          count > 0 ? <div key={index} className={cn("h-full", tones[index])} style={{ width: `${(count / Math.max(1, total)) * 100}%` }} /> : null,
        )}
      </div>
      {!compact && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
          {boxes.map((count, index) => (
            <span key={index}>
              {BOX_LABELS[index + 1]} {count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
