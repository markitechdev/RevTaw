"use client";

import { ArrowLeft, BookOpen, Flag, SendHorizontal, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { MessageBubble, type MessageExtras } from "@/components/tutor/message-bubble";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import { routes } from "@/lib/routes";
import { addToNotesAction, completeTutorSessionAction, createFlashcardAction, setConversationModeAction } from "@/lib/tutor/actions";
import type { ConversationDetail, MessageView } from "@/lib/tutor/queries";
import { TUTOR_ACTIONS, TUTOR_MODE_BY_ID, type FollowUpId, type TutorActionId } from "@/lib/tutor/types";
import { cn } from "@/lib/utils";

const COMPOSER_ACTIONS: TutorActionId[] = ["explain", "beginner", "example", "analogy", "step_by_step", "quiz", "guide", "why_wrong", "simplify"];

/** The tutor conversation: message list, quick actions, composer, follow-ups and (for study sessions) the end button. */
export function TutorChat({ conversation }: { conversation: ConversationDetail }) {
  const router = useRouter();
  const [messages, setMessages] = useState<MessageView[]>(conversation.messages);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [extras, setExtras] = useState<Record<string, MessageExtras>>({});
  const [mode, setMode] = useState(conversation.mode);
  const [pending, startTransition] = useTransition();
  const [ending, setEnding] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const optimisticCounter = useRef(0);

  const session = conversation.session;
  const sessionActive = session?.status === "in_progress";
  const locked = Boolean(session) && !sessionActive;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, sending]);

  const send = async (content: string, action: TutorActionId | null, selection: string | null = null) => {
    if (sending || locked) return;
    setError(null);
    setSending(true);
    optimisticCounter.current += 1;
    const optimistic: MessageView = {
      id: `pending-${optimisticCounter.current}`,
      role: "user",
      content: content || TUTOR_ACTIONS.find((item) => item.id === action)?.prompt || "",
      action,
      selection,
      grounding: null,
      sources: [],
      additional_explanation: null,
      follow_ups: [],
      flashcard: null,
      visual: null,
      created_at: "",
    };
    setMessages((state) => [...state, optimistic]);
    setDraft("");
    try {
      const response = await fetch(`/api/tutor/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ message: content, action, selection }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; userMessageId?: string; assistantMessageId?: string; reply?: MessageView & { answer: string } };
      if (!response.ok || !body.reply || !body.assistantMessageId) {
        setMessages((state) => state.filter((message) => message.id !== optimistic.id));
        setDraft(content);
        setError(body.error ?? "The tutor could not reply.");
        return;
      }
      const reply = body.reply as unknown as { answer: string; grounding: MessageView["grounding"]; sources: MessageView["sources"]; additional_explanation: string | null; follow_ups: FollowUpId[]; flashcard: MessageView["flashcard"]; visual?: MessageView["visual"] };
      setMessages((state) => [
        ...state.map((message) => (message.id === optimistic.id ? { ...message, id: body.userMessageId ?? message.id } : message)),
        {
          id: body.assistantMessageId!,
          role: "assistant",
          content: reply.answer,
          action: null,
          selection: null,
          grounding: reply.grounding,
          sources: reply.sources,
          additional_explanation: reply.additional_explanation,
          follow_ups: reply.follow_ups,
          flashcard: reply.flashcard,
          visual: reply.visual ?? null,
          created_at: "",
        },
      ]);
    } finally {
      setSending(false);
      textarea.current?.focus();
    }
  };

  // Stable, so the memoized message bubbles stay put while the student types.
  const followUp = useStableCallback((id: FollowUpId, action: TutorActionId | undefined, message: MessageView) => {
    if (id === "add_to_notes") {
      setExtras((state) => ({ ...state, [message.id]: { ...state[message.id], busy: id } }));
      startTransition(async () => {
        const result = await addToNotesAction(message.id);
        setExtras((state) => ({ ...state, [message.id]: { ...state[message.id], busy: null, ...(result.ok ? { notesReviewerId: result.data.reviewerId } : {}) } }));
        if (!result.ok) setError(result.message);
      });
      return;
    }
    if (id === "create_flashcard") {
      if (!message.flashcard) return;
      setExtras((state) => ({ ...state, [message.id]: { ...state[message.id], busy: id } }));
      startTransition(async () => {
        const result = await createFlashcardAction({ messageId: message.id, front: message.flashcard!.front, back: message.flashcard!.back });
        setExtras((state) => ({ ...state, [message.id]: { ...state[message.id], busy: null, ...(result.ok ? { flashcardDeckId: result.data.deckId } : {}) } }));
        if (!result.ok) setError(result.message);
      });
      return;
    }
    if (action) void send("", action);
  });

  const toggleMode = (next: "tutor" | "guided") => {
    setMode(next);
    startTransition(async () => {
      const result = await setConversationModeAction(conversation.id, next);
      if (!result.ok) setError(result.message);
    });
  };

  const endSession = () => {
    if (!session) return;
    setEnding(true);
    startTransition(async () => {
      const result = await completeTutorSessionAction(session.id);
      if (!result.ok) {
        setError(result.message);
        setEnding(false);
        return;
      }
      router.push(`${routes.study}/${session.id}`);
    });
  };

  const modeInfo = TUTOR_MODE_BY_ID[mode];

  return (
    <div className="flex min-h-[70vh] flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Link href={session ? routes.study : routes.tutor} className={buttonClasses({ variant: "ghost", size: "sm", className: "-ml-2 self-start" })}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {session ? "Study" : "AI Tutor"}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="truncate text-base font-medium">{conversation.title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge tone="primary">{modeInfo.label}</Badge>
              {conversation.material ? (
                <Link href={`${routes.materials}/${conversation.material.id}`} className="flex items-center gap-1 hover:underline">
                  <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  {conversation.material.title}
                </Link>
              ) : (
                <span>General questions · answers are not grounded in a material</span>
              )}
            </div>
          </div>
          {session ? (
            sessionActive ? (
              <Button type="button" size="sm" onClick={endSession} loading={ending}>
                {!ending && <Flag className="h-3.5 w-3.5" aria-hidden="true" />}
                End session &amp; get feedback
              </Button>
            ) : (
              <Link href={`${routes.study}/${session.id}`} className={buttonClasses({ size: "sm", variant: "secondary" })}>
                View session summary
              </Link>
            )
          ) : (
            <div className="flex rounded-lg border border-border p-0.5 text-xs" role="group" aria-label="Tutor mode">
              {(["tutor", "guided"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => toggleMode(item)}
                  aria-pressed={mode === item}
                  className={cn("rounded-md px-2.5 py-1 font-medium", mode === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
                >
                  {TUTOR_MODE_BY_ID[item].label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
            <Sparkles className="mx-auto mb-2 h-5 w-5 text-primary" aria-hidden="true" />
            Ask anything about {conversation.material ? "this material" : "your studies"} — explain, simplify, give an example, quiz me, or guide me without the answer.
            {conversation.material && " Answers cite the passages they come from."}
          </div>
        )}
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            materialId={conversation.material?.id ?? null}
            extras={extras[message.id]}
            disabled={sending || locked}
            onFollowUp={message.role === "assistant" && !locked ? followUp : undefined}
          />
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3 text-sm text-muted-foreground" role="status">
              <Sparkles className="h-4 w-4 animate-pulse text-primary" aria-hidden="true" />
              Thinking…
            </div>
          </div>
        )}
        <div ref={bottom} />
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {locked ? (
        <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">This session has ended. Start a new one from the Study page to continue.</p>
      ) : (
        <form
          className="sticky bottom-2 flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            if (draft.trim()) void send(draft.trim(), null);
          }}
        >
          <div className="flex flex-wrap gap-1.5">
            {COMPOSER_ACTIONS.map((id) => {
              const action = TUTOR_ACTIONS.find((item) => item.id === id)!;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={sending}
                  onClick={() => void send(draft.trim(), id)}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
                  title={action.prompt}
                >
                  {action.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-end gap-2">
            <Textarea
              ref={textarea}
              aria-label="Message the tutor"
              rows={2}
              maxLength={6000}
              value={draft}
              disabled={sending}
              placeholder={mode === "guided" ? "Tell the tutor what you are stuck on…" : "Ask a question, or pick an action above…"}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (draft.trim()) void send(draft.trim(), null);
                }
              }}
              className="min-h-0 flex-1 resize-none"
            />
            <Button type="submit" loading={sending} disabled={!draft.trim()} aria-label="Send">
              {!sending && <SendHorizontal className="h-4 w-4" aria-hidden="true" />}
              Send
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Enter sends · Shift+Enter adds a line. {pending ? "Saving…" : ""}</p>
        </form>
      )}
    </div>
  );
}
