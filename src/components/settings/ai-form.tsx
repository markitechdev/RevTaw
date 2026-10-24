"use client";

import { useOptimistic, useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { ChipGroup } from "@/components/ui/chip-group";
import { Segmented } from "@/components/ui/segmented";
import { saveAnswerStyleAction } from "@/lib/preferences/actions";
import { EXPLANATION_DEPTHS, RESPONSE_STYLES, type AiPreferences, type ExplanationDepth, type ResponseStyle } from "@/lib/preferences/options";

type AnswerStyle = { style: ResponseStyle; depth: ExplanationDepth };

/**
 * How Tamari explains (UI phase §23–§25, §35): the tone and how deep
 * explanations go, for Tamari in the panel and on Ask Tamari. The response language lives
 * with Tamari's settings. A direct request in a message ("explain it simply")
 * always wins for that answer.
 */
export function AiPreferencesForm({ initial }: { initial: AiPreferences }) {
  const [saved, setSaved] = useState<AnswerStyle>({ style: initial.style, depth: initial.depth });
  const [shown, setShown] = useOptimistic(saved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Picks save as they are made, like Tamari's switches beside this card.
  const save = (next: AnswerStyle) => {
    setError(null);
    startTransition(async () => {
      setShown(next);
      const result = await saveAnswerStyleAction(next);
      if (result.ok) setSaved(next);
      else setError(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-8">
      {error && <Alert tone="error">{error}</Alert>}

      <ChipGroup
        type="single"
        name="style"
        legend="Response style"
        value={shown.style}
        onChange={(style) => save({ ...shown, style })}
        options={RESPONSE_STYLES.map((item) => ({ value: item.id, label: item.label, hint: item.hint }))}
        look="card"
      />

      <div className="flex flex-col gap-2">
        <Segmented
          label="Explanation depth"
          hideLabel={false}
          name="depth"
          value={shown.depth}
          onChange={(depth) => save({ ...shown, depth })}
          options={EXPLANATION_DEPTHS.map((item) => ({ value: item.id, label: item.label, title: item.hint }))}
        />
        <p className="text-xs text-muted-foreground">{EXPLANATION_DEPTHS.find((item) => item.id === shown.depth)?.hint}</p>
      </div>

      <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
        {pending ? "Saving…" : "Changes save automatically. Tamari answers this way from your next message."}
      </p>
    </div>
  );
}
