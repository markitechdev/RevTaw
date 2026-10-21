"use client";

import { useOptimistic, useState, useTransition } from "react";

import { useModifierLabel } from "@/components/app/command-menu";
import { Alert } from "@/components/forms/form-alert";
import { TamariSprite } from "@/components/tamari/tamari-sprite";
import { useAppearance } from "@/components/theme/appearance-root";
import { Segmented } from "@/components/ui/segmented";
import { Switch } from "@/components/ui/switch";
import { saveAssistantPreferencesAction } from "@/lib/preferences/actions";
import type { AssistantPreferences } from "@/lib/preferences/schema";

type Corner = "tamari" | "button" | "hidden";

const CORNER_OPTIONS: ReadonlyArray<{ value: Corner; label: string }> = [
  { value: "tamari", label: "Tamari" },
  { value: "button", label: "Chat button" },
  { value: "hidden", label: "Nothing" },
];

/**
 * Tamari's settings (mascot doc §14): what sits in the corner, idle movement,
 * contextual hints, voice and spoken answers, plus the account-wide reduce
 * motion switch. Every switch saves on its own. With Tamari hidden the chat
 * keeps working from the plain button, Ctrl/Cmd+K and the "Ask Tamari why"
 * buttons.
 */
export function TamariPreferencesForm({ initial }: { initial: AssistantPreferences }) {
  const [saved, setSaved] = useState(initial);
  const [shown, setShown] = useOptimistic(saved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const modifier = useModifierLabel();
  const { appearance, save: saveAppearance, saving: savingAppearance } = useAppearance();

  const save = (next: AssistantPreferences) => {
    setError(null);
    startTransition(async () => {
      setShown(next);
      const result = await saveAssistantPreferencesAction(next);
      if (result.ok) setSaved(next);
      else setError(result.error);
    });
  };

  const corner: Corner = !shown.launcher ? "hidden" : shown.mascot ? "tamari" : "button";
  const setCorner = (value: Corner) => save({ ...shown, launcher: value !== "hidden", mascot: value === "hidden" ? shown.mascot : value === "tamari" });
  const cornerHint =
    corner === "tamari"
      ? "Tamari waits at the bottom right of every page and opens the chat."
      : corner === "button"
        ? "A plain chat button instead of Tamari. The chat itself works the same."
        : `Nothing in the corner. Open the chat from ${modifier}+K or the “Ask Tamari why” buttons.`;

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex items-center gap-4">
        {shown.mascot && <TamariSprite size={64} ambient={shown.idleAnimations} className="hidden sm:inline-block" />}
        <div className="min-w-0">
          <Segmented label="In the corner of every page" hideLabel={false} name="tamari-corner" value={corner} onChange={setCorner} options={CORNER_OPTIONS} />
          <p className="mt-2 text-xs text-muted-foreground">{cornerHint}</p>
        </div>
      </div>
      <Switch
        checked={shown.idleAnimations}
        disabled={!shown.mascot}
        onChange={(idleAnimations) => save({ ...shown, idleAnimations })}
        label="Idle animations"
        description="Tamari bobs a little while waiting and breathes while napping. Listening, thinking and reactions always show."
      />
      <Switch
        checked={shown.suggestions}
        onChange={(suggestions) => save({ ...shown, suggestions })}
        label="Contextual suggestions"
        description="Now and then Tamari says something short in a bubble: reviews due today, an exam coming up, a quiz result. A few times a session at most."
      />
      <Switch
        checked={shown.voice}
        onChange={(voice) => save({ ...shown, voice })}
        label="Voice interaction"
        description="Shows the microphone in Tamari's chat: ask a question or say a command like “Tamari, open the planner”. It only listens after you tap it."
      />
      <Switch
        checked={shown.voiceReplies}
        disabled={!shown.voice}
        onChange={(voiceReplies) => save({ ...shown, voiceReplies })}
        label="Read answers aloud when I ask by voice"
        description="Tamari listens and speaks in your response language (Auto uses your browser's language)."
      />
      <Switch
        checked={appearance.reduceMotion}
        onChange={(reduceMotion) => void saveAppearance({ ...appearance, reduceMotion })}
        label="Reduce motion"
        description="Holds Tamari still and turns off RevTaw's other animations too: the same switch as Appearance → Reduce motion."
      />
      <p className="text-xs text-muted-foreground">
        Voice uses your browser&apos;s speech service: Chrome and Edge send what you say to Google or Microsoft to turn it into text. RevTaw&apos;s server never receives the audio, and nothing is recorded.
      </p>
      <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
        {pending || savingAppearance ? "Saving…" : "Saved to your account."}
      </p>
    </div>
  );
}
