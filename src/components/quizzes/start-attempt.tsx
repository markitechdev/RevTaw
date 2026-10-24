"use client";

import { Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { Button, type ButtonProps } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { startAttemptAction } from "@/lib/quizzes/actions";
import { defaultExamMinutes, type QuizConfig } from "@/lib/quizzes/types";
import { routes } from "@/lib/routes";
import type { QuizMode } from "@/lib/supabase/database.types";

/** Starts a new attempt after confirming mode and timer. */
export function StartAttemptButton({
  quizId,
  config,
  questionCount,
  children = "Start quiz",
  ...props
}: Omit<ButtonProps, "onClick" | "type"> & { quizId: string; config: QuizConfig; questionCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<QuizMode>(config.mode);
  const [minutes, setMinutes] = useState<string>(config.timeLimitMinutes ? String(config.timeLimitMinutes) : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const examDefault = config.timeLimitMinutes ?? defaultExamMinutes(questionCount);
  const effectiveMinutes = minutes ? Number(minutes) : mode === "exam" ? examDefault : null;

  const start = () => {
    setError(null);
    startTransition(async () => {
      const result = await startAttemptAction({ quizId, mode, timeLimitMinutes: effectiveMinutes });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(`${routes.quiz}/${quizId}/attempt/${result.data.attemptId}`);
    });
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} {...props}>
        <Play className="h-4 w-4" aria-hidden="true" />
        {children}
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} dismissible={!pending} title="Start an attempt" description={`${questionCount} questions. Your answers are saved as you go.`}>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            start();
          }}
        >
          {error && <Alert tone="error">{error}</Alert>}
          <ChipGroup
            type="single"
            look="card"
            columns={1}
            name="attempt-mode"
            legend="Mode"
            value={mode}
            onChange={setMode}
            disabled={pending}
            options={[
              { value: "practice", label: "Practice", hint: `${config.feedback === "immediate" ? "Check each answer as you go." : "Feedback after you finish."} Timer optional.` },
              { value: "exam", label: "Exam simulation", hint: "Timed and shuffled, no hints or explanations until you submit. Submits itself when time runs out." },
            ]}
          />
          <Field
            id="attempt-minutes"
            label="Time limit (minutes)"
            hint={mode === "exam" ? `Leave empty to use ${examDefault} minutes.` : "Leave empty for no timer."}
          >
            <Input
              {...fieldA11y("attempt-minutes")}
              type="number"
              min={1}
              max={240}
              placeholder={mode === "exam" ? String(examDefault) : "None"}
              value={minutes}
              disabled={pending}
              onChange={(event) => setMinutes(event.target.value.replace(/[^\d]/g, "").slice(0, 3))}
            />
          </Field>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {!pending && <Play className="h-4 w-4" aria-hidden="true" />}
              {mode === "exam" ? "Start exam" : "Start practice"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
