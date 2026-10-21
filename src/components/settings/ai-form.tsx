"use client";

import { MessageCircle } from "lucide-react";
import { useId, useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { saveAiPreferencesAction, type SavePreferencesResult } from "@/lib/preferences/actions";
import { EXPLANATION_DEPTHS, RESPONSE_LANGUAGES, RESPONSE_STYLES, type AiPreferences, type ExplanationDepth, type ResponseLanguage, type ResponseStyle } from "@/lib/preferences/schema";

/** One sentence per language, so the choice is concrete (UI phase §23). */
const SAMPLE: Record<Exclude<ResponseLanguage, "auto" | "other">, string> = {
  en: "Photosynthesis turns sunlight into chemical energy, which the plant stores as glucose.",
  fil: "Ginagawang enerhiyang kemikal ng potosintesis ang sikat ng araw, at iniimbak ito ng halaman bilang glucose.",
  taglish: "Sa photosynthesis, ginagawang chemical energy ng halaman ang sunlight, tapos iniipon niya ito as glucose.",
};

function sampleFor(language: ResponseLanguage, other: string): string {
  if (language === "auto") return "Ask in English, Filipino or Taglish — RevTaw answers the way you asked.";
  if (language === "other") return other.trim() ? `RevTaw answers in ${other.trim()}.` : "Type the language RevTaw should answer in.";
  return SAMPLE[language];
}

/**
 * AI preferences (UI phase §23–§25, §35): the language RevTaw answers in, its
 * tone and how deep explanations go. A direct request in a message ("explain
 * in English") always wins for that answer.
 */
export function AiPreferencesForm({ initial }: { initial: AiPreferences }) {
  const [language, setLanguage] = useState<ResponseLanguage>(initial.language);
  const [other, setOther] = useState(initial.otherLanguage);
  const [style, setStyle] = useState<ResponseStyle>(initial.style);
  const [depth, setDepth] = useState<ExplanationDepth>(initial.depth);
  const [result, setResult] = useState<SavePreferencesResult | null>(null);
  const [pending, startTransition] = useTransition();
  const otherId = useId();

  const submit = () => {
    setResult(null);
    startTransition(async () => {
      setResult(await saveAiPreferencesAction({ language, otherLanguage: language === "other" ? other.trim() : "", style, depth, languageChosen: true }));
    });
  };

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {result && !result.ok && <Alert tone="error">{result.error}</Alert>}
      {result?.ok && <Alert tone="success">Saved. RevTaw will answer this way from your next message.</Alert>}

      <div className="flex flex-col gap-3">
        <ChipGroup
          type="single"
          name="language"
          legend="Response language"
          description="For Ask RevTaw and the AI Tutor. Generated quizzes, flashcards and reviewers keep your material's language."
          value={language}
          onChange={setLanguage}
          options={RESPONSE_LANGUAGES.map((item) => ({ value: item.id, label: item.label, hint: item.hint }))}
          look="card"
        />
        {language === "other" && (
          <div className="flex max-w-xs flex-col gap-1.5">
            <label htmlFor={otherId} className="text-sm font-medium text-foreground">
              Which language?
            </label>
            <Input id={otherId} value={other} maxLength={40} placeholder="e.g. Cebuano, Ilocano, Español" onChange={(event) => setOther(event.target.value)} aria-invalid={result && !result.ok && result.fieldErrors?.otherLanguage ? true : undefined} />
          </div>
        )}
        <p className="flex items-start gap-2 rounded-xl bg-muted/60 px-3 py-2.5 text-sm text-foreground">
          <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <span className="sr-only">Sample answer: </span>
            {sampleFor(language, other)}
          </span>
        </p>
      </div>

      <ChipGroup
        type="single"
        name="style"
        legend="Response style"
        value={style}
        onChange={setStyle}
        options={RESPONSE_STYLES.map((item) => ({ value: item.id, label: item.label, hint: item.hint }))}
        look="card"
      />

      <div className="flex flex-col gap-2">
        <Segmented
          label="Explanation depth"
          hideLabel={false}
          name="depth"
          value={depth}
          onChange={setDepth}
          options={EXPLANATION_DEPTHS.map((item) => ({ value: item.id, label: item.label, title: item.hint }))}
        />
        <p className="text-xs text-muted-foreground">{EXPLANATION_DEPTHS.find((item) => item.id === depth)?.hint}</p>
      </div>

      <div className="flex items-center gap-3 border-t border-border pt-5">
        <Button type="submit" loading={pending}>
          Save AI preferences
        </Button>
      </div>
    </form>
  );
}
