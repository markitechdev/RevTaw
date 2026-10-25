"use client";

import { ArrowLeft, BookOpen, Check, ChevronDown, FileText, History, Languages, Maximize2, MessageCircle, Mic, Minimize2, Minus, Paperclip, Plus, Quote, SendHorizontal, Square, Volume2, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useId, useOptimistic, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";

import { useAssistant, type AssistantRequest, type RegisteredPage } from "@/components/assistant/assistant-provider";
import { useVoice } from "@/components/assistant/use-voice";
import { Alert } from "@/components/forms/form-alert";
import { useTheme } from "@/components/theme/theme-provider";
import { useTamariMove } from "@/components/tamari/use-tamari-move";
import { MessageBubble, type MessageExtras } from "@/components/tutor/message-bubble";
import { endsUnanswered, ReplyRetry } from "@/components/tutor/reply-retry";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { TEXT_LINK } from "@/components/ui/text-link";
import { useStableCallback } from "@/lib/hooks/use-stable-callback";
import { moveTaskAction } from "@/lib/planner/actions";
import { saveResponseLanguageAction } from "@/lib/preferences/actions";
import type { ResponseLanguage } from "@/lib/preferences/options";
import { routes } from "@/lib/routes";
import { parseTamariCommand, spokenDay, type TamariCommand } from "@/lib/tamari/commands";
import { commandLines, hereLine, tamariLang, tamariLanguage, tamariStatus, transcribingLine } from "@/lib/tamari/lines";
import { TAMARI_TAGLINE, type TamariState } from "@/lib/tamari/states";
import { addToNotesAction, createFlashcardAction } from "@/lib/tutor/actions";
import type { MessageView } from "@/lib/tutor/queries";
import { TUTOR_ACTION_BY_ID, type FollowUpId, type TutorActionId } from "@/lib/tutor/types";
import { cn } from "@/lib/utils";
import { confirmationAnswer, routeVoiceCommand } from "@/lib/voice/intents";
import { listeningLanguage, speakableText, speakingLanguage, textLang } from "@/lib/voice/speech-text";

type ConversationInfo = { id: string; title: string; material: { id: string; title: string } | null };
type HistoryItem = { id: string; title: string; detail: string };
type MaterialOption = { id: string; title: string; subject: string | null };
type Reply = {
  answer: string;
  grounding: MessageView["grounding"];
  sources: MessageView["sources"];
  additional_explanation: string | null;
  follow_ups: FollowUpId[];
  flashcard: MessageView["flashcard"];
  visual?: MessageView["visual"];
};
type SendResponse = { error?: string; id?: string; conversation?: ConversationInfo | null; reused?: boolean; userMessageId?: string | null; assistantMessageId?: string; reply?: Reply; retryable?: boolean };
type SendInput = {
  content: string;
  action: TutorActionId | null;
  selection?: string | null;
  materialId?: string | null;
  continueThread?: boolean;
  fromVoice?: boolean;
  /** The answer a follow-up button was pressed under, so the follow-up is about it. */
  replyTo?: string | null;
};
type PendingSave = { kind: "save_note" | "save_flashcard"; message: MessageView };
type PendingMove = { taskId: string; title: string; date: string };

/** Today on the student's device, as YYYY-MM-DD (what "Friday" and "bukas" count from). */
function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** The four quick actions above the composer (UI phase §18); saving to notes and flashcards sits under each answer. */
const QUICK_ACTIONS: ReadonlyArray<{ id: TutorActionId; label: string }> = [
  { id: "explain", label: "Explain" },
  { id: "simplify", label: "Simplify" },
  { id: "example", label: "Give an example" },
  { id: "quiz", label: "Quiz me" },
];

const LANGUAGE_CHOICES: ReadonlyArray<{ id: ResponseLanguage; label: string }> = [
  { id: "auto", label: "Match my language" },
  { id: "en", label: "English" },
  { id: "fil", label: "Filipino" },
  { id: "taglish", label: "Taglish" },
];

const STORAGE_KEY = "revtaw-assistant";
const DESKTOP_QUERY = "(min-width: 64rem)";

/** The open chat survives a reload of this tab (sessionStorage), never another device or tab. */
function readStoredConversation(): string | null {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
  } catch {
    return null;
  }
}

function storeConversation(id: string | null): void {
  try {
    if (id) window.sessionStorage.setItem(STORAGE_KEY, id);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Blocked storage: the chat still works, it just is not reopened after a reload.
  }
}

function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Floating panel on wide screens, bottom sheet on phones and tablets. */
function useDesktop(): boolean {
  return useSyncExternalStore(subscribeDesktop, () => window.matchMedia(DESKTOP_QUERY).matches, () => true);
}

function timeAgo(iso: string | null, now: number): string {
  if (!iso) return "";
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "yesterday" : `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function fetchConversation(id: string): Promise<{ conversation: ConversationInfo; messages: MessageView[] } | null> {
  try {
    const response = await fetch(`/api/tutor/conversations/${id}/messages`, { headers: { accept: "application/json" } });
    if (!response.ok) return null;
    return (await response.json()) as { conversation: ConversationInfo; messages: MessageView[] };
  } catch {
    return null;
  }
}

function assistantMessage(id: string, reply: Reply): MessageView {
  return {
    id,
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
  };
}

/** Questions to start with, from what the page is about (a page can pass its own, like "Why did I get number 7 wrong?"). */
function suggestionsFor(page: RegisteredPage | null, useContext: boolean): string[] {
  if (page && useContext && page.suggestions.length > 0) return page.suggestions.slice(0, 3);
  switch (useContext ? page?.ref?.kind : undefined) {
    case "material":
      return ["What is this material mostly about?", "Explain the hardest part simply", "Quiz me on this material"];
    case "reviewer":
      return ["Summarize these notes in five points", "Quiz me on these notes", "Give me a mnemonic for this"];
    case "attempt":
      return ["Which questions did I get wrong, and why?", "Explain my mistakes simply", "Quiz me again on what I missed"];
    case "deck":
      return ["Quiz me on these cards", "Give me a mnemonic for the hardest card", "Explain these cards simply"];
    case "exam":
      return ["What should I review first?", "Make me a three-day plan for this exam", "Quiz me on the exam topics"];
    case "session":
      return ["Give me a hint", "Explain the idea behind this", "What should I focus on?"];
    case "progress":
      return ["What are my weakest topics?", "How do I improve my weakest topic?", "What should I study today?"];
    default:
      return ["Explain a topic simply", "Help me make a study plan for this week", "Quiz me on something I studied"];
  }
}

function HeaderButton({ label, onClick, className, children }: { label: string; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn("flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:h-9 lg:w-9", className)}
    >
      {children}
    </button>
  );
}

const chip =
  "inline-flex min-h-8 max-w-full cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60";

/**
 * The chat (UI phase §16–§22, companion doc §13): "Ask Tamari" with what
 * Tamari is doing right now (listening, thinking, talking) in words, the page
 * it is about, the conversation, quick actions and a composer that can attach
 * a material, send the page's context and listen (voice questions and
 * commands, answers read aloud). Tamari's picture stays outside the panel, on
 * Home only, and reacts to the chat from there, so the mascot never shows
 * twice. It is mounted once and only hidden when minimized, so the chat
 * carries across pages.
 */
export default function AssistantPanel() {
  const { open, page, ai, assistant, hide, subscribe, setActivity, voiceServer } = useAssistant();
  const { voiceReplies } = assistant;
  const router = useRouter();
  const { setTheme } = useTheme();
  const desktop = useDesktop();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const counter = useRef(0);
  /** Set once the student does anything, so a slow restore of the previous chat cannot overwrite it. */
  const touched = useRef(false);
  const titleId = useId();
  const pickerId = useId();
  const filterId = useId();
  const languageId = useId();
  const languageSelectId = useId();
  const confirmId = useId();

  const [restoreId] = useState(readStoredConversation);
  const [restoring, setRestoring] = useState(restoreId !== null);
  const [conversation, setConversation] = useState<ConversationInfo | null>(null);
  const [messages, setMessages] = useState<MessageView[]>([]);
  const [extras, setExtras] = useState<Record<string, MessageExtras>>({});
  const [draft, setDraft] = useState("");
  const [selection, setSelection] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Why the last question has no answer (shown with "Try again"); null when unknown. */
  const [failure, setFailure] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [contextOffFor, setContextOffFor] = useState<string | null>(null);
  const [attached, setAttached] = useState<MaterialOption | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [materials, setMaterials] = useState<MaterialOption[] | null>(null);
  const [filter, setFilter] = useState("");
  const [languageAsked, setLanguageAsked] = useState(ai.languageChosen);
  const [pendingSave, setPendingSave] = useState<PendingSave | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [moving, setMoving] = useState(false);
  const [, startSaving] = useTransition();
  // The language shows as changed at once; the saved preference follows when the page refreshes.
  const [shownLanguage, setShownLanguage] = useOptimistic(ai.language);
  const voice = useVoice(
    {
      onPartial: (text) => setDraft(text),
      onFinal: (text) => onVoice(text),
    },
    voiceServer,
  );
  /** The microphone shows when the browser can listen and the student keeps voice on. */
  const canListen = voice.supported && assistant.voice;
  const lang = tamariLanguage(shownLanguage);

  const pageKey = page?.ref ? JSON.stringify(page.ref) : null;
  const includeContext = pageKey !== null && contextOffFor !== pageKey;
  /** The material a new chat would be grounded in: one the student attached, else the page's. */
  const wantedMaterial = attached ?? (includeContext && page?.materialId ? { id: page.materialId, title: page.label } : null);
  const switchSuggested = conversation !== null && messages.length > 0 && wantedMaterial !== null && wantedMaterial.id !== (conversation.material?.id ?? null);

  // Show or hide the native dialog: modal bottom sheet on phones (focus stays inside), non-modal floating panel on desktop so the page stays usable.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }
    if (dialog.open && dialog.matches(":modal") === desktop) dialog.close();
    if (!dialog.open) {
      if (desktop) dialog.show();
      else dialog.showModal();
      if (desktop) textareaRef.current?.focus();
      else dialog.focus();
    }
  }, [open, desktop]);

  // Tamari, outside the panel, shows what the chat is doing: thinking about an answer (even minimized), listening, talking.
  useEffect(() => {
    setActivity("chat", sending);
    return () => setActivity("chat", false);
  }, [sending, setActivity]);
  useEffect(() => {
    setActivity("voice:listening", voice.status === "listening" || voice.status === "transcribing");
    setActivity("voice:speaking", voice.status === "speaking");
    return () => {
      setActivity("voice:listening", false);
      setActivity("voice:speaking", false);
    };
  }, [voice.status, setActivity]);

  // Minimizing stops listening and reading aloud.
  const { cancelListening, stopSpeaking } = voice;
  useEffect(() => {
    if (open) return;
    cancelListening();
    stopSpeaking();
  }, [open, cancelListening, stopSpeaking]);

  // A phone sheet keeps the page behind it from scrolling.
  useEffect(() => {
    if (!open || desktop) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open, desktop]);

  // Reopen the chat this tab had before a reload.
  useEffect(() => {
    if (!restoreId) return;
    let canceled = false;
    void fetchConversation(restoreId).then((data) => {
      if (canceled || touched.current) return;
      if (data) {
        setConversation(data.conversation);
        setMessages(data.messages);
      } else {
        storeConversation(null);
      }
      setRestoring(false);
    });
    return () => {
      canceled = true;
    };
  }, [restoreId]);

  // Keep the newest message in view (the welcome screen starts at the top).
  useEffect(() => {
    const list = listRef.current;
    if (list && (messages.length > 0 || sending)) list.scrollTop = list.scrollHeight;
  }, [messages.length, sending, view, open, restoring]);

  const { run: runMove } = useTamariMove({ ask: (prompt, material) => void send({ content: prompt, action: null, materialId: material }), setActivity });

  /** Says a short line in the chat (and aloud when the student is talking to Tamari). */
  const tell = (line: string, aloud: boolean) => {
    setNotice(line);
    setError(null);
    if (aloud && voiceReplies) void voice.speak(line, speakingLanguage(ai.language, line, navigator.language));
  };

  /** Runs one of Tamari's commands; false when it cannot (the message then goes to Tamari as a question). */
  const runCommand = (command: TamariCommand, aloud: boolean): boolean => {
    switch (command.kind) {
      case "plan": {
        tell(commandLines.plan(lang, command.minutes), aloud);
        void runMove({ kind: "plan", minutes: command.minutes, materialId: wantedMaterial?.id ?? conversation?.material?.id ?? null }).then((problem) => {
          if (problem) setError(problem);
          else if (!desktop) hide();
        });
        return true;
      }
      case "quiz": {
        const material = wantedMaterial ?? conversation?.material ?? null;
        if (!material && !command.topic) return false;
        tell(commandLines.quiz(lang, command.topic), aloud);
        const findMaterial = async (): Promise<string | null> => {
          if (material) return material.id;
          // "Quiz me about recursion" with nothing open: the material the topic is in, by name.
          const response = await fetch(`/api/search/quick?q=${encodeURIComponent(command.topic ?? "")}`, { headers: { accept: "application/json" } }).catch(() => null);
          const body = (response?.ok ? await response.json().catch(() => ({})) : {}) as { results?: Array<{ type: string; href: string }> };
          const hit = (body.results ?? []).find((result) => result.type === "material");
          return hit?.href.match(/\/materials\/([0-9a-f-]{36})/i)?.[1] ?? null;
        };
        void findMaterial().then(async (id) => {
          if (!id) {
            tell(commandLines.quizNeedsMaterial(lang), aloud);
            return;
          }
          const problem = await runMove({ kind: "session", method: "practice_testing", materialId: id, minutes: 10, focus: command.topic });
          if (problem) {
            setError(problem);
            return;
          }
          // The quiz is ready: say so, then get out of the way (a quiz is never interrupted).
          tell(commandLines.quizReady(lang), aloud);
          hide();
        });
        return true;
      }
      case "exam": {
        tell(commandLines.exam(lang, spokenDay(command.date)), aloud);
        // The material in view is likely what the exam covers.
        const covers = wantedMaterial?.id ?? conversation?.material?.id ?? null;
        router.push(`${routes.planner}?exam=new&examDate=${command.date}${command.title ? `&examTitle=${encodeURIComponent(command.title)}` : ""}${covers ? `&examMaterial=${covers}` : ""}`);
        if (!desktop) hide();
        return true;
      }
      case "language": {
        const next = command.language;
        const line = commandLines.language(lang, next === "auto" ? "auto" : tamariLanguage(next));
        setNotice(line);
        setError(null);
        if (aloud && voiceReplies) void voice.speak(line, speakingLanguage(next === "auto" ? shownLanguage : next, line, navigator.language));
        chooseLanguage(next);
        return true;
      }
      case "move": {
        if (page?.ref?.kind !== "task") {
          tell(commandLines.moveNeedsTask(lang), aloud);
          return true;
        }
        const title = page.label.replace(/^Planner → /, "");
        setPendingMove({ taskId: page.ref.id, title, date: command.date });
        if (aloud && voiceReplies) void voice.speak(commandLines.moveAsk(lang, title, spokenDay(command.date)), speakingLanguage(ai.language, title, navigator.language));
        return true;
      }
    }
  };

  const confirmMove = () => {
    if (!pendingMove || moving) return;
    const move = pendingMove;
    setMoving(true);
    void moveTaskAction(move.taskId, move.date)
      .then((result) => {
        setPendingMove(null);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setNotice(commandLines.moveDone(lang, spokenDay(result.data.scheduledFor)));
        router.refresh();
      })
      .catch(() => setError("The task could not be moved. Check your connection and try again."))
      .finally(() => setMoving(false));
  };

  const startNewChat = () => {
    touched.current = true;
    setRestoring(false);
    setConversation(null);
    setMessages([]);
    setExtras({});
    setError(null);
    setFailure(null);
    setSelection(null);
    setView("chat");
    storeConversation(null);
  };

  const send = async ({ content, action, selection: quoted = selection, materialId, continueThread = false, fromVoice = false, replyTo = null }: SendInput) => {
    const text = content.trim();
    if (sending || (!text && !action)) return;
    // "20 minutes lang ako", "quiz me about Chapter 4", "may exam ako Friday", "move this to Friday": Tamari does it.
    if (!action && !quoted && materialId === undefined && !continueThread) {
      const command = parseTamariCommand(text, localToday());
      if (command && runCommand(command, fromVoice)) {
        setDraft("");
        return;
      }
    }
    touched.current = true;
    setRestoring(false);
    const refocus = document.activeElement === textareaRef.current;
    // An explicit material (an "Ask why" button, a highlight) keeps the open chat only when it is about the same material.
    const explicit = materialId !== undefined;
    const target = explicit ? materialId : (wantedMaterial?.id ?? null);
    const current = conversation && (!explicit || (conversation.material?.id ?? null) === target) ? conversation : null;
    const previous = { conversation, messages, extras };
    counter.current += 1;
    const optimistic: MessageView = {
      id: `pending-${counter.current}`,
      role: "user",
      content: text || (action ? TUTOR_ACTION_BY_ID[action].prompt : ""),
      action,
      selection: quoted ?? null,
      grounding: null,
      sources: [],
      additional_explanation: null,
      follow_ups: [],
      flashcard: null,
      visual: null,
      created_at: "",
    };
    const base = current ? messages : [];
    setError(null);
    setFailure(null);
    setNotice(null);
    setView("chat");
    setSending(true);
    setMessages([...base, optimistic]);
    if (!current) {
      setConversation(null);
      setExtras({});
    }
    setDraft("");
    setSelection(null);
    const context = includeContext && page?.ref ? page.ref : null;
    try {
      const response = await fetch(current ? `/api/tutor/conversations/${current.id}/messages` : "/api/tutor/conversations", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(
          current
            ? { message: text, action, selection: quoted ?? null, context, replyTo }
            : { materialId: target, mode: "tutor", message: text || null, action, selection: quoted ?? null, context, reuse: continueThread },
        ),
      });
      const body = (await response.json().catch(() => ({}))) as SendResponse;
      // The AI failed, but the question is saved: keep it on screen with "Try again" instead of retyping.
      if (!response.ok && body.retryable && body.userMessageId) {
        const saved = { ...optimistic, id: body.userMessageId };
        if (!current) {
          const id = body.id ?? body.conversation?.id ?? null;
          if (id) {
            storeConversation(id);
            setConversation(body.conversation ?? { id, title: "New conversation", material: null });
          }
          const data = body.reused && id ? await fetchConversation(id) : null;
          setMessages(data?.messages ?? [saved]);
        } else {
          setMessages([...base.filter((message) => message.id !== optimistic.id), saved]);
        }
        setFailure(body.error ?? null);
        return;
      }
      if (!response.ok || !body.reply || !body.assistantMessageId) {
        setConversation(previous.conversation);
        setMessages(previous.messages);
        setExtras(previous.extras);
        setDraft(text);
        setSelection(quoted ?? null);
        setError(body.error ?? "Tamari could not answer just now. Please try again.");
        return;
      }
      const reply = assistantMessage(body.assistantMessageId, body.reply);
      // A spoken question gets a spoken answer (Settings → Tamari & AI → Sound responses can turn this off).
      if (fromVoice && voiceReplies) void voice.speak(speakableText(reply.content), speakingLanguage(ai.language, reply.content, navigator.language));
      if (current) {
        setMessages([...base.filter((message) => message.id !== optimistic.id), { ...optimistic, id: body.userMessageId ?? optimistic.id }, reply]);
        return;
      }
      const id = body.id ?? body.conversation?.id ?? null;
      if (!id) return;
      storeConversation(id);
      setConversation(body.conversation ?? { id, title: "New conversation", material: null });
      if (body.reused) {
        // The thread on this material already had messages: show all of it.
        const data = await fetchConversation(id);
        setMessages(data?.messages ?? [{ ...optimistic, id: body.userMessageId ?? optimistic.id }, reply]);
      } else {
        setMessages([{ ...optimistic, id: body.userMessageId ?? optimistic.id }, reply]);
      }
    } catch {
      setConversation(previous.conversation);
      setMessages(previous.messages);
      setExtras(previous.extras);
      setDraft(text);
      setSelection(quoted ?? null);
      setError("You seem to be offline. Your question is still in the box.");
    } finally {
      setSending(false);
      if (refocus) textareaRef.current?.focus();
    }
  };

  /** Answers the latest question again: after a failure, or in place of the last answer. */
  const retry = async () => {
    if (sending || !conversation) return;
    setSending(true);
    setFailure(null);
    setError(null);
    const context = includeContext && page?.ref ? page.ref : null;
    try {
      const response = await fetch(`/api/tutor/conversations/${conversation.id}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ regenerate: true, context }),
      });
      const body = (await response.json().catch(() => ({}))) as SendResponse;
      if (!response.ok || !body.reply || !body.assistantMessageId) {
        setFailure(body.error ?? "Tamari could not answer just now. Please try again.");
        return;
      }
      const reply = assistantMessage(body.assistantMessageId, body.reply);
      // The new answer follows the question it answers, replacing any answer after it.
      setMessages((state) => [...state.slice(0, state.map((message) => message.role).lastIndexOf("user") + 1), reply]);
    } catch {
      setFailure("You seem to be offline. Press Try again when you're back.");
    } finally {
      setSending(false);
    }
  };

  // Requests from the rest of the app ("Ask why", highlights, the command menu).
  const onRequest = useEffectEvent((request: AssistantRequest) => {
    setView("chat");
    if (request.selection) setSelection(request.selection.slice(0, 4000));
    if (request.send && !sending) {
      void send({ content: request.prompt ?? "", action: request.action ?? null, selection: request.selection ?? null, materialId: request.materialId, continueThread: request.continueThread });
      return;
    }
    if (request.prompt) setDraft(request.prompt);
    requestAnimationFrame(() => textareaRef.current?.focus());
  });
  useEffect(() => subscribe((request) => onRequest(request)), [subscribe]);

  // Stable, so the memoized message bubbles stay put while the student types.
  const followUp = useStableCallback((id: FollowUpId, action: TutorActionId | undefined, message: MessageView) => {
    if (id === "add_to_notes" || id === "create_flashcard") {
      if (id === "create_flashcard" && !message.flashcard) return;
      setExtras((state) => ({ ...state, [message.id]: { ...state[message.id], busy: id } }));
      startSaving(async () => {
        if (id === "add_to_notes") {
          const result = await addToNotesAction(message.id);
          setExtras((state) => ({ ...state, [message.id]: { ...state[message.id], busy: null, ...(result.ok ? { notesReviewerId: result.data.reviewerId } : {}) } }));
          if (!result.ok) setError(result.message);
        } else {
          const result = await createFlashcardAction({ messageId: message.id, front: message.flashcard!.front, back: message.flashcard!.back });
          setExtras((state) => ({ ...state, [message.id]: { ...state[message.id], busy: null, ...(result.ok ? { flashcardDeckId: result.data.deckId } : {}) } }));
          if (!result.ok) setError(result.message);
        }
      });
      return;
    }
    if (action) void send({ content: "", action, replyTo: message.id });
  });

  /** Says a short line aloud when the student is talking to Tamari (and spoken replies are on). */
  const say = (line: string) => {
    if (voiceReplies) void voice.speak(line, speakingLanguage(ai.language, line, navigator.language));
  };

  const confirmSave = () => {
    if (!pendingSave) return;
    followUp(pendingSave.kind === "save_note" ? "add_to_notes" : "create_flashcard", undefined, pendingSave.message);
    setPendingSave(null);
  };

  // What the student said: an answer to "Save this?", a command, or a question.
  const onVoice = (transcript: string) => {
    setDraft("");
    const text = transcript.trim();
    if (!text) return;
    if (pendingSave) {
      const answer = confirmationAnswer(text);
      if (answer === "yes") return confirmSave();
      if (answer === "no") {
        setPendingSave(null);
        setNotice("Okay, nothing was saved.");
        return;
      }
    }
    if (pendingMove) {
      const answer = confirmationAnswer(text);
      if (answer === "yes") return confirmMove();
      if (answer === "no") {
        setPendingMove(null);
        setNotice(commandLines.nothingMoved(lang));
        return;
      }
    }
    const command = parseTamariCommand(text, localToday());
    if (command && runCommand(command, true)) return;
    const intent = routeVoiceCommand(text);
    switch (intent.kind) {
      case "stop":
        voice.stopSpeaking();
        setPendingSave(null);
        return;
      case "new_chat":
        startNewChat();
        setNotice("New chat. What are we studying?");
        return;
      case "theme":
        setTheme(intent.theme);
        setNotice(intent.theme === "dark" ? "Dark mode is on." : "Light mode is on.");
        return;
      case "navigate":
        setNotice(`Opening ${intent.label}…`);
        router.push(intent.href);
        if (!desktop) hide();
        return;
      case "find":
        // "Open my Calculus reviewer": the best match by name, else the list it would be in.
        setNotice(`Looking for “${intent.query}”…`);
        void fetch(`/api/search/quick?q=${encodeURIComponent(intent.query)}`, { headers: { accept: "application/json" } })
          .then((response) => (response.ok ? response.json() : { results: [] }))
          .catch(() => ({ results: [] }))
          .then((body: { results?: Array<{ type: string; title: string; href: string }> }) => {
            const results = body.results ?? [];
            const match = results.find((result) => result.type === intent.type) ?? results[0];
            if (match) {
              setNotice(`Opening ${match.title}…`);
              router.push(match.href);
            } else {
              setNotice(`I couldn't find “${intent.query}”, so here are your ${intent.label.toLowerCase()}.`);
              router.push(intent.href);
            }
            if (!desktop) hide();
          });
        return;
      case "save_note":
      case "save_flashcard": {
        const last = [...messages].reverse().find((message) => message.role === "assistant" && !message.id.startsWith("pending-"));
        if (!last) {
          setNotice("There is no answer to save yet. Ask me something first.");
          return;
        }
        if (!conversation?.material) {
          setNotice("Saving needs a material: attach one or ask from a material's page.");
          return;
        }
        if (intent.kind === "save_flashcard" && !last.flashcard) {
          setNotice("That answer has no flashcard yet. Ask me to make one, then save it.");
          return;
        }
        setPendingSave({ kind: intent.kind, message: last });
        say(intent.kind === "save_note" ? "Save the last answer to your notes?" : "Make a flashcard from the last answer?");
        return;
      }
      case "ask":
        // Just "Tamari": answer, without sending anything to the AI.
        if (!intent.text) {
          const line = hereLine(tamariLanguage(ai.language));
          setNotice(line);
          say(line);
          return;
        }
        void send({ content: intent.text, action: null, fromVoice: true });
        return;
    }
  };

  const toggleListening = () => {
    if (voice.status === "listening") {
      voice.stopListening();
      return;
    }
    setNotice(null);
    setError(null);
    void voice.listen(listeningLanguage(ai.language, navigator.language));
  };

  /** Escape: stop listening or reading first, then close the material list, then minimize. */
  const onEscape = () => {
    if (voice.status === "listening") voice.cancelListening();
    else if (voice.status === "speaking") voice.stopSpeaking();
    else if (pickerOpen) setPickerOpen(false);
    else hide();
  };

  const openHistory = () => {
    setView("history");
    setHistory(null);
    setPickerOpen(false);
    fetch("/api/tutor/conversations?limit=15", { headers: { accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : { conversations: [] }))
      .then((body: { conversations?: Array<{ id: string; title: string; materialTitle: string | null; lastMessageAt: string | null; messageCount: number }> }) => {
        const now = Date.now();
        setHistory(
          (body.conversations ?? []).map((item) => ({
            id: item.id,
            title: item.title,
            detail: [item.materialTitle ?? "General questions", timeAgo(item.lastMessageAt, now)].filter(Boolean).join(" · "),
          })),
        );
      })
      .catch(() => setHistory([]));
  };

  const openConversation = async (id: string) => {
    setView("chat");
    if (conversation?.id === id) return;
    touched.current = true;
    setError(null);
    setNotice(null);
    setRestoring(true);
    const data = await fetchConversation(id);
    setRestoring(false);
    if (!data) {
      setError("That chat could not be opened.");
      return;
    }
    setConversation(data.conversation);
    setMessages(data.messages);
    setExtras({});
    setAttached(null);
    storeConversation(id);
  };

  const togglePicker = () => {
    if (pickerOpen) {
      setPickerOpen(false);
      return;
    }
    setPickerOpen(true);
    if (materials === null) {
      fetch("/api/materials", { headers: { accept: "application/json" } })
        .then((response) => (response.ok ? response.json() : { materials: [] }))
        .then((body: { materials?: MaterialOption[] }) => setMaterials(body.materials ?? []))
        .catch(() => setMaterials([]));
    }
  };

  const attach = (material: MaterialOption) => {
    setPickerOpen(false);
    setFilter("");
    setAttached(material);
    if (conversation && messages.length > 0 && conversation.material?.id !== material.id) {
      startNewChat();
      setNotice(`New chat about ${material.title}. Your last chat is in History.`);
    }
    textareaRef.current?.focus();
  };

  /** Changes the language Tamari answers in, any time (the chips, the select or "English please"). */
  const chooseLanguage = (language: ResponseLanguage) => {
    setLanguageAsked(true);
    startSaving(async () => {
      setShownLanguage(language);
      const result = await saveResponseLanguageAction({ language, otherLanguage: language === "other" ? ai.otherLanguage : "" });
      if (!result.ok) setError(result.error);
    });
  };

  const suggestions = suggestionsFor(page, includeContext);
  const tamariState: TamariState = voice.status === "listening" ? "listening" : sending || voice.status === "transcribing" ? "thinking" : voice.status === "speaking" ? "speaking" : "idle";
  const shownMaterials = (materials ?? []).filter((material) => !filter.trim() || `${material.title} ${material.subject ?? ""}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const contextLine = includeContext && page ? page.label : (conversation?.material?.title ?? attached?.title ?? null);

  return (
    <dialog
      ref={dialogRef}
      id="ask-revtaw"
      data-expanded={expanded || undefined}
      aria-labelledby={titleId}
      tabIndex={-1}
      onClose={() => {
        // The browser can close a modal dialog itself (Escape pressed twice): keep the provider in step.
        if (open && !dialogRef.current?.open) hide();
      }}
      onCancel={(event) => {
        event.preventDefault();
        onEscape();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !desktop) return;
        event.preventDefault();
        onEscape();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current && !desktop) hide();
      }}
      className={cn(
        "z-50 m-0 max-h-none max-w-none flex-col overflow-hidden border-border bg-card p-0 text-foreground shadow-pop outline-none backdrop:bg-black/40 open:flex",
        // Phones and tablets: a bottom sheet over the tab bar.
        "fixed inset-x-0 top-auto bottom-0 h-[min(88dvh,46rem)] w-full rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)] open:animate-sheet-up",
        // Desktop: a floating panel at the bottom right.
        "lg:inset-x-auto lg:right-6 lg:bottom-6 lg:rounded-2xl lg:border lg:pb-0 lg:open:animate-panel-in",
        expanded ? "lg:h-[calc(100dvh-3rem)] lg:w-[min(46rem,calc(100vw-20rem))]" : "lg:h-[min(40rem,calc(100dvh-3rem))] lg:w-[26rem]",
      )}
    >
      <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border lg:hidden" />
      <header className="flex items-center gap-2.5 border-b border-border py-2 pr-2 pl-3">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <MessageCircle className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="font-display tracking-display text-base leading-tight font-semibold">
            {view === "history" ? "Your chats" : "Ask Tamari"}
          </h2>
          <p lang={view !== "history" && tamariState !== "idle" ? tamariLang(lang) : undefined} className={cn("text-xs leading-snug", tamariState === "idle" || view === "history" ? "text-muted-foreground" : "font-medium text-primary")}>
            {view === "history" ? "Pick one to keep going" : tamariState === "idle" ? TAMARI_TAGLINE : tamariStatus(tamariState, lang)}
          </p>
        </div>
        {view === "chat" && (
          <HeaderButton label="Chat history" onClick={openHistory}>
            <History className="h-4 w-4" aria-hidden="true" />
          </HeaderButton>
        )}
        <HeaderButton
          label="New chat"
          onClick={() => {
            startNewChat();
            setAttached(null);
            setNotice(null);
            textareaRef.current?.focus();
          }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </HeaderButton>
        <HeaderButton label={expanded ? "Make the panel smaller" : "Make the panel bigger"} onClick={() => setExpanded((value) => !value)} className="hidden lg:flex">
          {expanded ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
        </HeaderButton>
        <HeaderButton label="Minimize Tamari" onClick={hide}>
          <Minus className="h-4 w-4" aria-hidden="true" />
        </HeaderButton>
      </header>

      {view === "history" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-border px-2 py-1.5">
            <button type="button" onClick={() => setView("chat")} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-foreground hover:bg-muted">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to chat
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {history === null ? (
              <p role="status" className="px-2 py-6 text-center text-sm text-muted-foreground">
                Loading your chats…
              </p>
            ) : history.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">No chats yet. Ask your first question and it will be here.</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {history.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void openConversation(item.id)}
                      aria-current={conversation?.id === item.id ? "true" : undefined}
                      className="flex w-full cursor-pointer flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left hover:bg-muted aria-[current]:bg-primary-soft"
                    >
                      <span className="line-clamp-1 text-sm font-medium text-foreground">{item.title}</span>
                      <span className="line-clamp-1 text-xs text-muted-foreground">{item.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-border px-4 py-3">
            <Link href={routes.tutor} onClick={hide} className={cn("text-sm", TEXT_LINK)}>
              Open Ask Tamari for every chat and study mode
            </Link>
          </div>
        </div>
      ) : (
        <>
          {contextLine && (
            <p className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="shrink-0 font-medium text-foreground">Context:</span>
              <span className="min-w-0 truncate">{contextLine}</span>
            </p>
          )}
          {switchSuggested && wantedMaterial && (
            <div className="flex items-center gap-2 border-b border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <p className="min-w-0 flex-1 truncate">This chat is about {conversation?.material?.title ?? "general questions"}.</p>
              <button
                type="button"
                onClick={() => {
                  startNewChat();
                  setNotice(`New chat about ${wantedMaterial.title}. Your last chat is in History.`);
                  textareaRef.current?.focus();
                }}
                className="shrink-0 cursor-pointer rounded-md px-1.5 py-1 font-semibold text-primary hover:bg-primary-soft"
              >
                New chat about this
              </button>
            </div>
          )}

          <div ref={listRef} role="log" aria-label="Conversation with Tamari" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-3 py-4">
            {restoring ? (
              <p role="status" className="py-8 text-center text-sm text-muted-foreground">
                Opening your chat…
              </p>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-2 text-center">
                <div className="flex flex-col gap-1">
                  <p className="font-display tracking-display text-lg font-semibold text-foreground">What are we studying?</p>
                  <p className="text-sm text-muted-foreground">
                    {includeContext && page ? (
                      <>
                        I can see <span className="font-medium text-foreground">{page.label}</span>. Ask about it, or anything else.
                      </>
                    ) : (
                      "I'm Tamari, your study buddy. Ask me to explain, simplify, give an example or quiz you."
                    )}
                  </p>
                </div>
                <ul className="flex w-full flex-col gap-2" aria-label="Suggested questions">
                  {suggestions.map((suggestion) => (
                    <li key={suggestion}>
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => void send({ content: suggestion, action: null })}
                        className="w-full cursor-pointer rounded-xl border border-border bg-background px-3.5 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary-soft disabled:opacity-60"
                      >
                        {suggestion}
                      </button>
                    </li>
                  ))}
                </ul>
                {!languageAsked && (
                  <div role="group" aria-labelledby={languageId} className="flex w-full flex-col gap-2 rounded-xl bg-muted/60 p-3 text-left">
                    <p id={languageId} className="text-sm font-medium text-foreground">
                      <span lang="fil">Anong language gusto mong gamitin natin?</span>
                      <span className="block text-xs font-normal text-muted-foreground">Which language should I answer in?</span>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {LANGUAGE_CHOICES.map((choice) => (
                        <button key={choice.id} type="button" onClick={() => chooseLanguage(choice.id)} className={cn(chip, "border-border bg-card text-foreground hover:border-primary/40 hover:text-primary")}>
                          {choice.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Change it any time under the message box, by saying “English please” or “Tagalog na lang”, or in Settings → Tamari &amp; AI.</p>
                  </div>
                )}
              </div>
            ) : (
              messages.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
                  materialId={conversation?.material?.id ?? null}
                  extras={extras[message.id]}
                  disabled={sending}
                  saveable={Boolean(conversation?.material)}
                  onFollowUp={message.role === "assistant" && !message.id.startsWith("pending-") ? followUp : undefined}
                />
              ))
            )}
            {!sending && !restoring && endsUnanswered(messages) && <ReplyRetry message={failure} onRetry={() => void retry()} />}
            {sending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <span aria-hidden="true" className="tamari-dots static flex">
                  <i />
                  <i />
                  <i />
                </span>
                <span lang={tamariLang(lang)}>{tamariStatus("thinking", lang)}</span>
              </div>
            )}
          </div>

          <form
            className="flex flex-col gap-2 border-t border-border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send({ content: draft, action: null });
            }}
          >
            {error && <Alert tone="error">{error}</Alert>}
            {pendingSave && (
              <div role="group" aria-labelledby={confirmId} className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary-soft p-3">
                <p id={confirmId} className="text-sm font-medium text-foreground">
                  {pendingSave.kind === "save_note" ? "Save the last answer to your notes?" : "Make a flashcard from the last answer?"}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" onClick={confirmSave}>
                    {pendingSave.kind === "save_note" ? "Save to notes" : "Create flashcard"}
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setPendingSave(null)}>
                    Cancel
                  </Button>
                  {canListen && <span className="text-xs text-muted-foreground">or say “yes” or “no”</span>}
                </div>
              </div>
            )}
            {pendingMove && (
              <div role="group" aria-label="Move the task" className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary-soft p-3">
                <p lang={tamariLang(lang)} className="text-sm font-medium text-foreground">
                  {commandLines.moveAsk(lang, pendingMove.title, spokenDay(pendingMove.date))}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" loading={moving} onClick={confirmMove}>
                    Move to {spokenDay(pendingMove.date).split(",")[0]}
                  </Button>
                  <Button type="button" size="sm" variant="secondary" disabled={moving} onClick={() => setPendingMove(null)}>
                    Cancel
                  </Button>
                  {canListen && <span className="text-xs text-muted-foreground">or say “yes” or “no”</span>}
                </div>
              </div>
            )}
            {notice && (
              <p role="status" lang={textLang(notice)} className="text-xs text-muted-foreground">
                {notice}
              </p>
            )}
            {selection && (
              <div className="flex items-start gap-2 rounded-lg bg-primary-soft px-3 py-2 text-xs text-foreground">
                <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                <p className="line-clamp-3 min-w-0 flex-1">
                  <span className="sr-only">Highlighted text: </span>
                  {selection}
                </p>
                <button type="button" onClick={() => setSelection(null)} aria-label="Remove the highlighted text" className="touch-target relative -m-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}

            <div role="group" aria-label="Quick actions" className="flex flex-wrap gap-1.5">
              {QUICK_ACTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={sending}
                  onClick={() => void send({ content: draft, action: item.id })}
                  title={TUTOR_ACTION_BY_ID[item.id].prompt}
                  className={cn(chip, "border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary-soft hover:text-primary")}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="flex items-end gap-1.5 rounded-xl border border-input bg-background p-1.5 pl-3 transition-shadow focus-within:border-primary focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
              <textarea
                ref={textareaRef}
                rows={1}
                maxLength={6000}
                value={draft}
                aria-label="Message Tamari"
                placeholder={selection ? "Ask about the highlighted text…" : "Ask Tamari anything…"}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void send({ content: draft, action: null });
                  }
                }}
                className="field-sizing-content max-h-36 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground"
              />
              {canListen && (
                <button
                  type="button"
                  onClick={toggleListening}
                  disabled={sending || voice.status === "transcribing"}
                  aria-pressed={voice.status === "listening"}
                  aria-label="Ask by voice"
                  title={voice.status === "listening" ? "Stop listening" : "Ask by voice: a question, or a command like “open the planner”"}
                  className={cn(
                    "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    voice.status === "listening" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {voice.status === "listening" ? <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
                </button>
              )}
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                aria-label="Send"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary text-primary-foreground transition-[background-color,transform] hover:bg-primary-hover active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
              >
                <SendHorizontal className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Languages className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <label htmlFor={languageSelectId}>Tamari answers in</label>
              <span className="relative inline-flex items-center">
                {/* Sized to the chosen language (where the browser can), with its own arrow right beside it. */}
                <select
                  id={languageSelectId}
                  value={shownLanguage}
                  onChange={(event) => chooseLanguage(event.target.value as ResponseLanguage)}
                  className="field-sizing-content min-h-6 cursor-pointer appearance-none rounded-md border border-transparent bg-transparent py-0.5 pl-1 pr-5 font-medium text-foreground hover:border-border [&>option]:bg-card"
                >
                  {LANGUAGE_CHOICES.map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.label}
                    </option>
                  ))}
                  {(ai.otherLanguage || shownLanguage === "other") && <option value="other">{ai.otherLanguage || "Another language"}</option>}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1 h-3 w-3 text-muted-foreground" aria-hidden="true" />
              </span>
            </div>

            {voice.status === "listening" && (
              <p role="status" className="flex items-center gap-2 text-xs font-medium text-primary">
                <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                <span lang={tamariLang(lang)}>{tamariStatus("listening", lang)}</span> Ask a question, or say “open the planner”.
              </p>
            )}
            {voice.status === "transcribing" && (
              <p role="status" className="flex items-center gap-2 text-xs font-medium text-primary">
                <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                <span lang={tamariLang(lang)}>{transcribingLine(lang)}</span>
              </p>
            )}
            {voice.status === "speaking" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Volume2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span role="status">Tamari is reading the answer aloud</span>
                <button type="button" onClick={voice.stopSpeaking} className="cursor-pointer rounded-md px-1.5 py-0.5 font-semibold text-primary hover:bg-primary-soft">
                  Stop
                </button>
              </div>
            )}
            {voice.error && (
              <p role="alert" className="text-xs text-danger">
                {voice.error}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-1.5">
              {page?.ref && (
                <button
                  type="button"
                  aria-pressed={includeContext}
                  onClick={() => setContextOffFor(includeContext ? pageKey : null)}
                  title={includeContext ? "Tamari sees what this page is about. Select to ask without it." : "Select to let Tamari see what this page is about."}
                  className={cn(chip, includeContext ? "border-primary/40 bg-primary-soft text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground")}
                >
                  {includeContext ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                  <span className="sr-only">Include this page: </span>
                  <span className="max-w-[13rem] truncate">{page.label}</span>
                </button>
              )}
              <button
                type="button"
                aria-expanded={pickerOpen}
                aria-controls={pickerId}
                onClick={togglePicker}
                className={cn(chip, attached ? "border-primary/40 bg-primary-soft text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground")}
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="max-w-[11rem] truncate">{attached ? attached.title : "Attach material"}</span>
              </button>
              {attached && (
                <button type="button" onClick={() => setAttached(null)} aria-label={`Detach ${attached.title}`} className="touch-target relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            {pickerOpen && (
              <div id={pickerId} role="group" aria-label="Attach a material" className="flex max-h-56 flex-col gap-1 overflow-y-auto overscroll-contain rounded-xl border border-border bg-background p-1.5">
                {materials === null ? (
                  <p role="status" className="px-2 py-3 text-sm text-muted-foreground">
                    Loading your materials…
                  </p>
                ) : materials.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-muted-foreground">
                    No material is ready yet.{" "}
                    <Link href={`${routes.materials}?upload=1`} onClick={hide} className={TEXT_LINK}>
                      Upload one
                    </Link>
                  </p>
                ) : (
                  <>
                    {materials.length > 6 && (
                      <div className="px-1 pt-1 pb-1.5">
                        <label htmlFor={filterId} className="sr-only">
                          Filter materials
                        </label>
                        <SearchInput
                          id={filterId}
                          size="sm"
                          value={filter}
                          onChange={(event) => setFilter(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.preventDefault();
                          }}
                          placeholder="Filter materials"
                        />
                      </div>
                    )}
                    {shownMaterials.length === 0 && <p className="px-2 py-2 text-sm text-muted-foreground">No material matches.</p>}
                    {shownMaterials.map((material) => (
                      <button
                        key={material.id}
                        type="button"
                        onClick={() => attach(material)}
                        aria-pressed={attached?.id === material.id}
                        className="flex cursor-pointer flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left hover:bg-muted aria-pressed:bg-primary-soft"
                      >
                        <span className="line-clamp-1 text-sm font-medium text-foreground">{material.title}</span>
                        {material.subject && <span className="text-xs text-muted-foreground">{material.subject}</span>}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </form>
        </>
      )}
    </dialog>
  );
}
