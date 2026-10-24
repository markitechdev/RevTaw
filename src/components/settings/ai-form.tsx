"use client";

import { useState, useTransition } from "react";

import { Alert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { Segmented } from "@/components/ui/segmented";
import { saveAnswerStyleAction, type SavePreferencesResult } from "@/lib/preferences/actions";
import { EXPLANATION_DEPTHS, RESPONSE_STYLES, type AiPreferences, type ExplanationDepth, type ResponseStyle } from "@/lib/preferences/options";

/**
 * How Tamari explains (UI phase §23–§25, §35): the tone and how deep
 * explanations go, for Tamari and the AI Tutor. The response language lives
 * with Tamari's settings. A direct request in a message ("explain it simply")
 * always wins for that answer.
 */
export function AiPreferencesForm({ initial }: { initial: AiPreferences }) {
  const [style, setStyle] = useState<ResponseStyle>(initial.style);
  const [depth, setDepth] = useState<ExplanationDepth>(initial.depth);
  const [result, setResult] = useState<SavePreferencesResult | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setResult(null);
    startTransition(async () => {
      setResult(await saveAnswerStyleAction({ style, depth }));
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
      {result?.ok && <Alert tone="success">Saved. Tamari will answer this way from your next message.</Alert>}

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
          Save
        </Button>
      </div>
    </form>
  );
}
