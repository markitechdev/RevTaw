"use client";

import { ListChecks, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { Button, type ButtonProps } from "@/components/ui/button";
import { ChipGroup } from "@/components/ui/chip-group";
import { Dialog } from "@/components/ui/dialog";
import { Disclosure } from "@/components/ui/disclosure";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_QUIZ_CONFIG,
  QUESTION_TYPE_IDS,
  QUESTION_TYPES,
  QUIZ_MAX_QUESTIONS,
  QUIZ_MIN_QUESTIONS,
  QUIZ_PRESET_COUNTS,
  quizConfigSchema,
  typeCoverageError,
  type QuizConfig,
} from "@/lib/quizzes/types";
import { clearQueryParam } from "@/lib/hooks/query-param";
import { routes } from "@/lib/routes";

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
  const coverage = config.questionTypes.length > 0 ? typeCoverageError(config) : null;
  const advancedSummary = [
    config.mode === "exam" ? "Exam simulation" : "Practice",
    config.mode === "exam" || config.feedback === "after" ? "feedback at the end" : "feedback after each answer",
    config.timeLimitMinutes ? `${config.timeLimitMinutes} min` : "no timer",
    config.shuffleQuestions ? "shuffled" : "in order",
    config.focus ? `focus: ${config.focus}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
    const coverageProblem = typeCoverageError(parsed.data);
    if (coverageProblem) {
      setError(coverageProblem);
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

          <div className="flex flex-col gap-2">
            <ChipGroup
              type="multiple"
              name="question-type"
              legend="Question types"
              description="Pick as many as you like — a mixed quiz gets every type you pick."
              value={config.questionTypes}
              onChange={(next) => update({ questionTypes: QUESTION_TYPE_IDS.filter((id) => next.includes(id)) })}
              options={QUESTION_TYPES.map((type) => ({ value: type.id, label: type.name, hint: type.grading === "ai" ? "Graded by AI" : "Graded instantly", disabled: pending }))}
              look="card"
            />
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <button type="button" className="cursor-pointer font-medium text-primary hover:underline" onClick={() => update({ questionTypes: [...QUESTION_TYPE_IDS] })} disabled={pending}>
                All types
              </button>
              <button type="button" className="cursor-pointer font-medium text-primary hover:underline" onClick={() => update({ questionTypes: QUESTION_TYPES.filter((type) => type.grading === "auto").map((type) => type.id) })} disabled={pending}>
                Quick check (instant grading)
              </button>
              <button type="button" className="cursor-pointer font-medium text-primary hover:underline" onClick={() => update({ questionTypes: QUESTION_TYPES.filter((type) => type.grading === "ai").map((type) => type.id) })} disabled={pending}>
                Written answers
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,16.5rem)]">
            <div className="flex flex-col gap-2">
              <Segmented
                label="Number of questions"
                hideLabel={false}
                name="question-count"
                value={customCount ? "custom" : String(config.questionCount)}
                onChange={(value) => {
                  if (value === "custom") {
                    setCustomCount(true);
                    return;
                  }
                  setCustomCount(false);
                  update({ questionCount: Number(value) });
                }}
                options={[...QUIZ_PRESET_COUNTS.map((count) => ({ value: String(count), label: String(count) })), { value: "custom", label: "Custom" }]}
              />
              {customCount && (
                <Input
                  aria-label="Custom number of questions"
                  type="number"
                  min={QUIZ_MIN_QUESTIONS}
                  max={QUIZ_MAX_QUESTIONS}
                  value={config.questionCount}
                  onChange={(event) => update({ questionCount: Number(event.target.value) || QUIZ_MIN_QUESTIONS })}
                  className="max-w-32"
                />
              )}
            </div>
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
          {coverage && (
            <p className="-mt-2 text-sm text-warning" role="status">
              {coverage}
            </p>
          )}

          <Disclosure label="Advanced options" summary={advancedSummary} className="rounded-xl border border-border px-4">
            <div className="flex flex-col gap-5 pb-4">
              <ChipGroup
                type="single"
                name="quiz-mode"
                legend="Mode"
                value={config.mode}
                onChange={(mode) => update({ mode, feedback: mode === "exam" ? "after" : config.feedback })}
                options={[
                  { value: "practice", label: "Practice", hint: "Untimed by default, with feedback as you go.", disabled: pending },
                  { value: "exam", label: "Exam simulation", hint: "Timed, shuffled, no hints; results after you submit.", disabled: pending },
                ]}
                look="card"
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Segmented
                    label="Feedback"
                    hideLabel={false}
                    name="quiz-feedback"
                    value={config.mode === "exam" ? "after" : config.feedback}
                    onChange={(feedback) => {
                      if (config.mode !== "exam") update({ feedback });
                    }}
                    options={[
                      { value: "immediate", label: "After each answer" },
                      { value: "after", label: "At the end" },
                    ]}
                  />
                  {config.mode === "exam" && <p className="text-xs text-muted-foreground">Exam mode always shows feedback after you submit.</p>}
                </div>
                <Field id="quiz-timer" label="Time limit (minutes)" hint="Empty means no timer. Exam mode defaults to a minute per question.">
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
              <div className="flex flex-col gap-3">
                <Switch checked={config.shuffleQuestions} onChange={(shuffleQuestions) => update({ shuffleQuestions })} disabled={pending} label="Shuffle question order" />
                <Switch checked={config.shuffleOptions} onChange={(shuffleOptions) => update({ shuffleOptions })} disabled={pending} label="Shuffle multiple-choice options" />
                <Switch
                  checked={config.askConfidence}
                  onChange={(askConfidence) => update({ askConfidence })}
                  disabled={pending}
                  label="Ask how sure I am"
                  description="A quick “How sure are you?” per answer helps RevTaw spot lucky guesses and misconceptions."
                />
              </div>
              <Field id="quiz-focus" label="Focus on a topic (optional)" hint="Only questions about this part of the material, e.g. a chapter or a concept.">
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
          </Disclosure>

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
