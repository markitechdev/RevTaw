"use client";

import { BookOpen, Layers, NotebookPen, Pencil, Quote, RotateCcw } from "lucide-react";
import Link from "next/link";
import { memo } from "react";

import { Markdown } from "@/components/content/markdown";
import { VisualView } from "@/components/study/visual-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TEXT_LINK } from "@/components/ui/text-link";
import { CONTENT_PAGE_SIZE, pageOfIndex, withPage } from "@/lib/pagination";
import { routes } from "@/lib/routes";
import type { MessageView } from "@/lib/tutor/queries";
import { FOLLOW_UPS, groundingLabel, TUTOR_ACTION_BY_ID, type FollowUpId, type TutorActionId } from "@/lib/tutor/types";
import { cn } from "@/lib/utils";
import { textLang } from "@/lib/voice/speech-text";

export type MessageExtras = { notesReviewerId?: string; flashcardDeckId?: string; busy?: FollowUpId | null };

/** One chat turn: the student's question (with highlight) or the tutor's grounded answer with sources and actions. */
/**
 * One message in a conversation. Memoized: the composer re-renders its parent
 * on every keystroke, and nothing about an existing message changes then (its
 * parents keep `onFollowUp` stable with useStableCallback).
 */
export const MessageBubble = memo(function MessageBubble({
  message,
  materialId,
  extras,
  disabled,
  onFollowUp,
  onRegenerate,
  onEdit,
  saveable = true,
}: {
  message: MessageView;
  materialId: string | null;
  extras?: MessageExtras;
  disabled?: boolean;
  onFollowUp?: (id: FollowUpId, action: TutorActionId | undefined, message: MessageView) => void;
  /** The latest answer only: answer the same question again, another way. */
  onRegenerate?: () => void;
  /** The latest question only: put it back in the box to change and resend. */
  onEdit?: (message: MessageView) => void;
  /** Offer "Add to notes" and "Create flashcard" (they need a material to save into). */
  saveable?: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-sm text-primary-foreground">
          {message.selection && (
            <blockquote className="mb-2 flex gap-2 rounded-lg bg-primary-foreground/15 px-3 py-2 text-xs italic">
              <Quote className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden="true" />
              <span className="line-clamp-4">{message.selection}</span>
            </blockquote>
          )}
          {message.action && <span className="mb-1 block text-2xs font-semibold uppercase tracking-wide">{TUTOR_ACTION_BY_ID[message.action as TutorActionId]?.label ?? message.action}</span>}
          <p lang={textLang(message.content)} className="whitespace-pre-wrap">
            {message.content}
          </p>
        </div>
        {onEdit && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onEdit(message)}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
          >
            <Pencil className="h-3 w-3" aria-hidden="true" />
            Edit question
          </button>
        )}
      </div>
    );
  }

  const grounding = message.grounding;
  const label = groundingLabel(grounding, materialId !== null);
  // Small talk (no grounding) has nothing to save or build on.
  const followUps = grounding === null ? [] : FOLLOW_UPS.filter((item) => (item.id === "add_to_notes" || item.id === "create_flashcard" ? saveable : message.follow_ups.includes(item.id)));

  return (
    <div className="flex justify-start">
      <div className="flex max-w-[92%] flex-col gap-3 rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3 text-sm">
        {label && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={grounding === "material" ? "success" : grounding === "partial" ? "primary" : grounding === "not_found" ? "warning" : "neutral"}>
              <BookOpen className="h-3 w-3" aria-hidden="true" />
              {label}
            </Badge>
          </div>
        )}
        <Markdown source={message.content} lang={textLang(message.content)} className="text-sm" />
        {message.visual && (
          <div className="rounded-lg border border-border bg-background p-3">
            <VisualView visual={message.visual} title="Visual" />
          </div>
        )}
        {message.additional_explanation && (
          <div className="rounded-lg border border-dashed border-border bg-muted/50 px-3 py-2 text-xs">
            <p className="font-semibold uppercase tracking-wide text-muted-foreground">Additional explanation (general knowledge)</p>
            <p lang={textLang(message.additional_explanation)} className="mt-1 text-foreground/90">
              {message.additional_explanation}
            </p>
          </div>
        )}
        {message.sources.length > 0 && (
          <details className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium text-muted-foreground">
              Sources in your material ({message.sources.length})
            </summary>
            <ul className="mt-2 flex flex-col gap-2">
              {message.sources.map((source, index) => (
                <li key={`${source.position}-${index}`} className="border-l-2 border-primary/40 pl-2">
                  <p className="font-medium">
                    {source.heading ?? `Section ${source.position + 1}`}
                    {source.pages ? ` · p. ${source.pages}` : ""}
                    {materialId && (
                      <Link href={`${withPage(`${routes.materials}/${materialId}`, { tab: "content" }, pageOfIndex(source.position, CONTENT_PAGE_SIZE))}#chunk-${source.position + 1}`} className={cn("ml-2", TEXT_LINK)}>
                        open
                      </Link>
                    )}
                  </p>
                  {source.quote && <p className="italic text-muted-foreground">“{source.quote}”</p>}
                </li>
              ))}
            </ul>
          </details>
        )}
        {onRegenerate && (
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              disabled={disabled}
              onClick={onRegenerate}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Answer again
            </button>
          </div>
        )}
        {onFollowUp && followUps.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
            {followUps.map((item) => {
              const saved = (item.id === "add_to_notes" && extras?.notesReviewerId) || (item.id === "create_flashcard" && extras?.flashcardDeckId);
              if (item.id === "create_flashcard" && !message.flashcard) return null;
              if (saved) {
                return (
                  <Link
                    key={item.id}
                    href={item.id === "add_to_notes" ? `${routes.notes}/${extras?.notesReviewerId}` : `${routes.flashcards}/${extras?.flashcardDeckId}`}
                    className="inline-flex items-center gap-1 rounded-full border border-success/40 bg-success-soft px-3 py-1 text-xs font-medium text-success hover:underline"
                  >
                    {item.id === "add_to_notes" ? <NotebookPen className="h-3 w-3" aria-hidden="true" /> : <Layers className="h-3 w-3" aria-hidden="true" />}
                    {item.id === "add_to_notes" ? "Saved to notes" : "Card created"}
                  </Link>
                );
              }
              return (
                <Button
                  key={item.id}
                  type="button"
                  size="sm"
                  variant="secondary"
                  className={cn("h-7 rounded-full px-3 text-xs")}
                  disabled={disabled}
                  loading={extras?.busy === item.id}
                  onClick={() => onFollowUp(item.id, item.action, message)}
                >
                  {item.label}
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});
