"use client";

import { MessageCircle } from "lucide-react";
import { useId, useOptimistic, useState, useTransition } from "react";

import { useModifierLabel } from "@/components/app/command-menu";
import { Alert } from "@/components/forms/form-alert";
import { TamariSprite } from "@/components/tamari/tamari-sprite";
import { useAppearance } from "@/components/theme/appearance-root";
import { Button } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { saveAssistantPreferencesAction, saveResponseLanguageAction } from "@/lib/preferences/actions";
import { RESPONSE_LANGUAGES, type AiPreferences, type AssistantPreferences, type ResponseLanguage } from "@/lib/preferences/schema";

/** One sentence per language, so the choice is concrete (UI phase §23). */
const SAMPLE: Record<Exclude<ResponseLanguage, "auto" | "other">, string> = {
  en: "Photosynthesis turns sunlight into chemical energy, which the plant stores as glucose.",
  fil: "Ginagawang enerhiyang kemikal ng potosintesis ang sikat ng araw, at iniimbak ito ng halaman bilang glucose.",
  taglish: "Sa photosynthesis, ginagawang chemical energy ng halaman ang sunlight, tapos iniipon niya ito as glucose.",
};

function sampleFor(language: ResponseLanguage, other: string): string {
  if (language === "auto") return "Ask in English, Filipino or Taglish — Tamari answers the way you asked.";
  if (language === "other") return other.trim() ? `Tamari answers in ${other.trim()}.` : "Type the language Tamari should answer in.";
  return SAMPLE[language];
}

/**
 * Tamari's settings (companion doc §19): show Tamari, pixel animations, study
 * suggestions, voice commands, contextual reactions, sound responses and the
 * response language — none of them mandatory. Every switch saves on its own;
 * the language saves with its button (it may need a name typed in). With
 * Tamari hidden the chat keeps working from a plain button, Ctrl/Cmd+K and the
 * "Ask Tamari why" buttons.
 */
export function TamariPreferencesForm({ initial, ai }: { initial: AssistantPreferences; ai: AiPreferences }) {
  const [saved, setSaved] = useState(initial);
  const [shown, setShown] = useOptimistic(saved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const modifier = useModifierLabel();
  const { appearance, save: saveAppearance, saving: savingAppearance } = useAppearance();
  const [language, setLanguage] = useState<ResponseLanguage>(ai.language);
  const [other, setOther] = useState(ai.otherLanguage);
  const [languageState, setLanguageState] = useState<"idle" | "saving" | "saved" | { error: string }>("idle");
  const otherId = useId();

  const save = (next: AssistantPreferences) => {
    setError(null);
    startTransition(async () => {
      setShown(next);
      const result = await saveAssistantPreferencesAction(next);
      if (result.ok) setSaved(next);
      else setError(result.error);
    });
  };

  const saveLanguage = () => {
    setLanguageState("saving");
    startTransition(async () => {
      const result = await saveResponseLanguageAction({ language, otherLanguage: other.trim() });
      setLanguageState(result.ok ? "saved" : { error: result.error });
    });
  };
  const languageChanged = language !== ai.language || (language === "other" && other.trim() !== ai.otherLanguage);

  return (
    <div className="flex flex-col gap-5">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex items-start gap-4">
        {shown.mascot && <TamariSprite size={72} animate={shown.idleAnimations} className="hidden shrink-0 sm:inline-block" />}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Switch
            checked={shown.mascot}
            onChange={(mascot) => save({ ...shown, mascot })}
            label="Show Tamari"
            description="Tamari sits beside your greeting on Home, peeks from the edge of other pages and opens the chat when you click it. Off: a plain chat button instead — the chat works the same."
          />
          {!shown.mascot && (
            <Switch
              checked={shown.launcher}
              onChange={(launcher) => save({ ...shown, launcher })}
              label="Show the chat button"
              description={`A small “Ask Tamari” button in the corner. Off: open the chat from ${modifier}+K or the “Ask Tamari why” buttons.`}
            />
          )}
        </div>
      </div>
      <Switch
        checked={shown.idleAnimations}
        disabled={!shown.mascot}
        onChange={(idleAnimations) => save({ ...shown, idleAnimations })}
        label="Pixel animations"
        description="Tamari's small pixel movements: breathing, blinking, typing on the laptop, a bounce. Off: Tamari holds still and only changes pose."
      />
      <Switch
        checked={shown.suggestions}
        onChange={(suggestions) => save({ ...shown, suggestions })}
        label="Study suggestions"
        description="Short lines from your own study data — today's reviews, an exam coming up, a topic you keep missing — and the offer to plan your free minutes. “Later” puts one off for the day."
      />
      <Switch
        checked={shown.reactions}
        onChange={(reactions) => save({ ...shown, reactions })}
        label="Contextual reactions"
        description="Tamari's face follows what happens: a bounce for a right answer, a serious look for a repeated mistake, exam mode before an exam, a nap when you're away. Off: Tamari stays calm."
      />
      <Switch
        checked={shown.voice}
        onChange={(voice) => save({ ...shown, voice })}
        label="Voice commands"
        description="The microphone in the chat: ask a question or say “Tamari, 20 minutes lang ako” or “quiz me about Chapter 4”. It only listens after you tap it."
      />
      <Switch
        checked={shown.voiceReplies}
        disabled={!shown.voice}
        onChange={(voiceReplies) => save({ ...shown, voiceReplies })}
        label="Sound responses"
        description="Tamari reads its answers aloud when you ask by voice, in your response language. Nothing ever plays on its own."
      />

      <div className="flex flex-col gap-3 border-t border-border pt-5">
        <ChipGroup
          type="single"
          name="language"
          legend="Response language"
          description="How Tamari answers you, here and in the AI Tutor. Auto answers in the language you write in, Taglish included. Generated quizzes, flashcards and reviewers keep your material's language."
          value={language}
          onChange={(value) => {
            setLanguage(value);
            setLanguageState("idle");
          }}
          options={RESPONSE_LANGUAGES.map((item) => ({ value: item.id, label: item.label, hint: item.hint }))}
          look="card"
        />
        {language === "other" && (
          <div className="flex max-w-xs flex-col gap-1.5">
            <label htmlFor={otherId} className="text-sm font-medium text-foreground">
              Which language?
            </label>
            <Input id={otherId} value={other} maxLength={40} placeholder="e.g. Cebuano, Ilocano, Español" onChange={(event) => setOther(event.target.value)} aria-invalid={typeof languageState === "object" ? true : undefined} />
          </div>
        )}
        <p className="flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-sm text-foreground">
          <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="sr-only">Sample answer: </span>
            {sampleFor(language, other)}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" variant={languageChanged ? "primary" : "secondary"} onClick={saveLanguage} loading={languageState === "saving"}>
            Save language
          </Button>
          <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
            {languageState === "saved" ? "Saved. Tamari answers this way from your next message." : typeof languageState === "object" ? languageState.error : ""}
          </p>
        </div>
      </div>

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
