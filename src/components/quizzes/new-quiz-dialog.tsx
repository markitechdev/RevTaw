"use client";

import { ListChecks, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  DEFAULT_QUIZ_CONFIG,
  QUESTION_TYPES,
  QUIZ_MAX_QUESTIONS,
  QUIZ_MIN_QUESTIONS,
  QUIZ_PRESET_COUNTS,
  quizConfigSchema,
  type QuizConfig,
} from "@/lib/quizzes/types";
import { clearQueryParam } from "@/lib/hooks/query-param";
import { routes } from "@/lib/routes";
import type { QuestionType } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

export type QuizMaterialOption = { id: string; title: string; subject?: string | null };

/**
 * Button + dialog that configures and generates a quiz. Pass `materialId` to
 * pin the material (material page) or `materials` to let the student choose.
 */
export function NewQuizButton({
  materialId,
  materials = [],
  disabled,
  defaultOpen = false,
  children = "Create quiz",
  ...props
}: Omit<ButtonProps, "onClick" | "type"> & { materialId?: string; materials?: QuizMaterialOption[]; /** Open on arrival (/quiz?create=1). */ defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen && (Boolean(materialId) || materials.length > 0));
  const [material, setMaterial] = useState(materialId ?? materials[0]?.id ?? "");
  const [config, setConfig] = useState<QuizConfig>(DEFAULT_QUIZ_CONFIG);
  const [customCount, setCustomCount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (patch: Partial<QuizConfig>) => setConfig((current) => ({ ...current, ...patch }));
  const toggleType = (type: QuestionType) =>
    update({
      questionTypes: config.questionTypes.includes(type)
        ? config.questionTypes.filter((item) => item !== type)
        : [...config.questionTypes, type],
    });

  const generate = () => {
    setError(null);
    const target = materialId ?? material;
    if (!target) {
      setError("Choose a material first.");
      return;
    }
    const parsed = quizConfigSchema.safeParse(config);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the quiz settings.");
      return;
    }
    startTransition(async () => {
      const response = await fetch("/api/quizzes", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...parsed.data, materialId: target }),
      });
      const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!response.ok || !body.id) {
        setError(body.error ?? "The quiz could not be created.");
        return;
      }
      router.push(`${routes.quiz}/${body.id}`);
    });
  };

  const noMaterials = !materialId && materials.length === 0;

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} disabled={disabled || noMaterials} {...props}>
        <ListChecks className="h-4 w-4" aria-hidden="true" />
        {children}
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          if (pending) return;
          setOpen(false);
          clearQueryParam("create");
        }}
        dismissible={!pending}
        title="Create a quiz"
        description="Questions are written only from the material, with the answer and its source saved for every item."
        className="max-w-2xl"
      >
        <form
          className="flex flex-col gap-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            generate();
          }}
        >
          {error && <Alert tone="error">{error}</Alert>}

          {!materialId && (
            <Field id="quiz-material" label="Material" required>
              <Select {...fieldA11y("quiz-material")} value={material} onChange={(event) => setMaterial(event.target.value)} disabled={pending}>
                {materials.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                    {item.subject ? ` · ${item.subject}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <fieldset disabled={pending}>
            <legend className="mb-1.5 text-sm font-medium">Question types</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {QUESTION_TYPES.map((type) => (
                <label
                  key={type.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded-lg border border-border bg-card p-2.5 text-sm transition-colors",
                    "hover:bg-muted/60 has-checked:border-primary has-checked:bg-primary-soft",
                  )}
                >
                  <input
                    type="checkbox"
                    name="question-type"
                    value={type.id}
                    checked={config.questionTypes.includes(type.id)}
                    onChange={() => toggleType(type.id)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium text-foreground">{type.name}</span>
                    <span className="text-xs text-muted-foreground">{type.grading === "ai" ? "AI-graded" : "Auto-graded"}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <fieldset disabled={pending}>
              <legend className="mb-1.5 text-sm font-medium">Number of questions</legend>
              <div className="flex flex-wrap gap-2">
                {QUIZ_PRESET_COUNTS.map((count) => (
                  <Button
                    key={count}
                    type="button"
                    size="sm"
                    variant={!customCount && config.questionCount === count ? "primary" : "secondary"}
                    onClick={() => {
                      setCustomCount(false);
                      update({ questionCount: count });
                    }}
                  >
                    {count}
                  </Button>
                ))}
                <Button type="button" size="sm" variant={customCount ? "primary" : "secondary"} onClick={() => setCustomCount(true)}>
                  Custom
                </Button>
              </div>
              {customCount && (
                <Input
                  aria-label="Custom number of questions"
                  type="number"
                  min={QUIZ_MIN_QUESTIONS}
                  max={QUIZ_MAX_QUESTIONS}
                  value={config.questionCount}
                  onChange={(event) => update({ questionCount: Number(event.target.value) || QUIZ_MIN_QUESTIONS })}
                  className="mt-2 max-w-32"
                />
              )}
            </fieldset>

            <Field id="quiz-difficulty" label="Difficulty">
              <Select {...fieldA11y("quiz-difficulty")} value={config.difficulty} disabled={pending} onChange={(event) => update({ difficulty: event.target.value as QuizConfig["difficulty"] })}>
                <option value="adaptive">Adaptive — from your mastery</option>
                <option value="mixed">Mixed</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <fieldset disabled={pending}>
              <legend className="mb-1.5 text-sm font-medium">Default mode</legend>
              <div className="flex flex-col gap-2">
                {(
                  [
                    ["practice", "Practice", "Untimed by default, with feedback as you go."],
                    ["exam", "Exam simulation", "Timed, shuffled, no hints; results after submission."],
                  ] as const
                ).map(([value, label, hint]) => (
                  <label key={value} className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2.5 text-sm has-checked:border-primary has-checked:bg-primary-soft">
                    <input
                      type="radio"
                      name="quiz-mode"
                      value={value}
                      checked={config.mode === value}
                      onChange={() => update({ mode: value, feedback: value === "exam" ? "after" : config.feedback })}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span className="flex flex-col">
                      <span className="font-medium">{label}</span>
                      <span className="text-xs text-muted-foreground">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-4">
              <Field id="quiz-feedback" label="Feedback" hint={config.mode === "exam" ? "Exam mode always shows feedback after submission." : undefined}>
                <Select
                  {...fieldA11y("quiz-feedback")}
                  value={config.mode === "exam" ? "after" : config.feedback}
                  disabled={pending || config.mode === "exam"}
                  onChange={(event) => update({ feedback: event.target.value as QuizConfig["feedback"] })}
                >
                  <option value="immediate">Immediately after each answer</option>
                  <option value="after">After I finish the quiz</option>
                </Select>
              </Field>
              <Field id="quiz-timer" label="Time limit (minutes)" hint="Leave empty for no timer. Exam mode defaults to one minute per question.">
                <Input
                  {...fieldA11y("quiz-timer")}
                  type="number"
                  min={1}
                  max={240}
                  placeholder="None"
                  value={config.timeLimitMinutes ?? ""}
                  disabled={pending}
                  onChange={(event) => update({ timeLimitMinutes: event.target.value ? Math.max(1, Math.min(240, Number(event.target.value))) : null })}
                />
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={config.shuffleQuestions} disabled={pending} onChange={(event) => update({ shuffleQuestions: event.target.checked })} className="h-4 w-4 accent-primary" />
                Shuffle question order
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={config.shuffleOptions} disabled={pending} onChange={(event) => update({ shuffleOptions: event.target.checked })} className="h-4 w-4 accent-primary" />
                Shuffle multiple-choice options
              </label>
            </div>
            <Field id="quiz-focus" label="Focus (optional)" hint="A topic or chapter to concentrate on.">
              <Input
                {...fieldA11y("quiz-focus")}
                value={config.focus ?? ""}
                maxLength={200}
                placeholder="e.g. Chapter 2, photosynthesis equations"
                disabled={pending}
                onChange={(event) => update({ focus: event.target.value || null })}
              />
            </Field>
          </div>

          {pending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Sparkles className="h-4 w-4 animate-pulse text-primary" aria-hidden="true" />
              Writing {config.questionCount} questions… this usually takes under a minute.
            </p>
          )}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {!pending && <Sparkles className="h-4 w-4" aria-hidden="true" />}
              Generate quiz
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
