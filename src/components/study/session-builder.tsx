"use client";

import { Play, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { startSessionAction } from "@/lib/study/actions";
import { BUILDER_METHOD_IDS, isBuilderMethod, isTestMethod, METHOD_BEHAVIOUR, RAPID_REVIEW_MINUTES, recommendMethods, TIME_PRESETS, type BuilderMethodId } from "@/lib/study/catalog";
import { STUDY_METHOD_BY_ID } from "@/lib/study/methods";
import { PROBLEM_DIFFICULTIES, PROBLEM_DIFFICULTY_LABEL, type ProblemDifficulty } from "@/lib/study/problem-options";
import type { SessionGoal } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

export type BuilderMaterial = { id: string; title: string; subject: string | null };

const GOALS: ReadonlyArray<{ id: SessionGoal; label: string; hint: string }> = [
  { id: "memorize", label: "Memorize", hint: "Definitions, terms, facts" },
  { id: "understand", label: "Understand", hint: "Explain ideas in your own words" },
  { id: "practice", label: "Practice", hint: "Answer questions and get feedback" },
  { id: "exam_prep", label: "Exam preparation", hint: "Simulate test conditions" },
  { id: "quick_review", label: "Quick review", hint: "A short refresher" },
  { id: "master_topic", label: "Master topic", hint: "Push weak concepts to strong" },
];

/** What the "Preparing your session…" line says while a method's session is generated. */
const PREPARING: Partial<Record<BuilderMethodId, string>> = {
  active_recall: "picking what to ask",
  feynman: "picking what to ask",
  practice_testing: "writing the test",
  smart_study: "planning the blocks from your data",
  retrieval_practice: "picking what to ask",
  rapid_review: "picking what to ask",
  cumulative_review: "picking what to ask",
  interleaving: "picking what to ask",
  blurting: "setting up",
  chunking: "splitting the material into chunks",
  question_generation: "setting up",
  mixed_practice: "writing the test",
  exam_simulation: "writing the test",
  worked_examples: "writing worked examples",
  faded_worked_examples: "writing the examples",
  practice_problems: "writing the problems",
  scenario_based: "writing the scenarios",
  case_based: "writing the cases",
  sq3r: "preparing the chapter",
};

const POMODORO_PRESETS: ReadonlyArray<{ work: number; rest: number }> = [
  { work: 15, rest: 5 },
  { work: 25, rest: 5 },
  { work: 45, rest: 10 },
  { work: 50, rest: 10 },
  { work: 60, rest: 15 },
];

/** Study session builder (§26): material → time → goal → method → start. */
export function SessionBuilder({
  materials,
  defaultMinutes,
  openMistakes,
  dueCards,
  initialMethod,
  initialMaterialId,
}: {
  materials: BuilderMaterial[];
  defaultMinutes: number;
  openMistakes: number;
  dueCards: number;
  initialMethod?: string;
  initialMaterialId?: string;
}) {
  const router = useRouter();
  const [materialId, setMaterialId] = useState<string>(initialMaterialId && materials.some((m) => m.id === initialMaterialId) ? initialMaterialId : (materials[0]?.id ?? ""));
  const [minutes, setMinutes] = useState<number>(initialMethod === "rapid_review" ? 10 : defaultMinutes);
  const [customMinutes, setCustomMinutes] = useState(initialMethod !== "rapid_review" && !(TIME_PRESETS as readonly number[]).includes(defaultMinutes));
  const [goal, setGoal] = useState<SessionGoal>("practice");
  const [method, setMethod] = useState<BuilderMethodId>(initialMethod && isBuilderMethod(initialMethod) ? initialMethod : "active_recall");
  const [questionCount, setQuestionCount] = useState(10);
  const [timed, setTimed] = useState(true);
  const [problemDifficulty, setProblemDifficulty] = useState<ProblemDifficulty | "adaptive">("adaptive");
  const [pomodoro, setPomodoro] = useState<{ work: number; rest: number }>({ work: 25, rest: 5 });
  const [topic, setTopic] = useState("");
  const [extraMaterials, setExtraMaterials] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const behaviour = METHOD_BEHAVIOUR[method];
  const needsMaterial = behaviour.requiresMaterial;
  const effectiveMaterial = needsMaterial || materialId !== "none" ? materialId : "";
  const recommended = useMemo(() => recommendMethods(goal, Boolean(effectiveMaterial && effectiveMaterial !== "none")), [goal, effectiveMaterial]);
  const isTest = isTestMethod(method);
  const timePresets: readonly number[] = method === "rapid_review" ? RAPID_REVIEW_MINUTES : TIME_PRESETS;

  const start = () => {
    setError(null);
    if (needsMaterial && (!materialId || materialId === "none")) {
      setError(`${STUDY_METHOD_BY_ID[method].name} needs a material. Upload one first or pick another method.`);
      return;
    }
    const others = extraMaterials.filter((id) => id !== materialId);
    if (method === "interleaving" && others.length === 0) {
      setError("Interleaving mixes materials: tick at least one more material to combine.");
      return;
    }
    startTransition(async () => {
      const result = await startSessionAction({
        method,
        materialId: materialId && materialId !== "none" ? materialId : null,
        materialIds: method === "interleaving" ? others : undefined,
        goal,
        plannedMinutes: method === "rapid_review" ? Math.min(15, Math.max(5, minutes)) : minutes,
        questionCount: isTest ? questionCount : undefined,
        timed: method === "practice_testing" ? timed : method === "exam_simulation" ? true : undefined,
        problemDifficulty: method === "practice_problems" ? problemDifficulty : undefined,
        workMinutes: method === "pomodoro" ? pomodoro.work : undefined,
        breakMinutes: method === "pomodoro" ? pomodoro.rest : undefined,
        topic: method === "pomodoro" ? topic || null : undefined,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push(result.data.redirect);
    });
  };

  const chooseMethod = (id: BuilderMethodId) => {
    setMethod(id);
    if (id === "rapid_review") {
      setCustomMinutes(false);
      setMinutes([...RAPID_REVIEW_MINUTES].reduce((best, option) => (Math.abs(option - minutes) < Math.abs(best - minutes) ? option : best), RAPID_REVIEW_MINUTES[0]));
    }
  };

  const methodDisabled = (id: BuilderMethodId) => {
    if (id === "error_review") return openMistakes === 0;
    if (id === "spaced_repetition") return dueCards === 0;
    if (id === "interleaving") return materials.length < 2;
    if (METHOD_BEHAVIOUR[id].requiresMaterial && materials.length === 0) return true;
    return false;
  };

  const sectionTitle = "text-sm font-semibold";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start a session</CardTitle>
        <CardDescription>Four quick choices. The method decides how the session behaves, not just what it is called.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-6"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            start();
          }}
        >
          {error && <Alert tone="error">{error}</Alert>}

          <Field id="session-material" label="1 · What are you studying?" hint={materials.length === 0 ? "No processed materials yet — Pomodoro and Error Review still work without one." : undefined}>
            <Select {...fieldA11y("session-material")} value={materialId || "none"} disabled={pending} onChange={(event) => setMaterialId(event.target.value)}>
              {materials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.title}
                  {material.subject ? ` · ${material.subject}` : ""}
                </option>
              ))}
              <option value="none">No specific material</option>
            </Select>
          </Field>

          <fieldset disabled={pending}>
            <legend className={cn(sectionTitle, "mb-1.5")}>2 · How much time do you have?</legend>
            <div className="flex flex-wrap items-center gap-2">
              {timePresets.map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  size="sm"
                  variant={!customMinutes && minutes === preset ? "primary" : "secondary"}
                  onClick={() => {
                    setCustomMinutes(false);
                    setMinutes(preset);
                  }}
                >
                  {preset} min
                </Button>
              ))}
              {method !== "rapid_review" && (
                <Button type="button" size="sm" variant={customMinutes ? "primary" : "secondary"} onClick={() => setCustomMinutes(true)}>
                  Custom
                </Button>
              )}
              {method === "rapid_review" && <span className="text-xs text-muted-foreground">Rapid review is 5, 10 or 15 minutes by design.</span>}
              {customMinutes && method !== "rapid_review" && (
                <Input
                  aria-label="Custom minutes"
                  type="number"
                  min={1}
                  max={480}
                  value={minutes}
                  onChange={(event) => setMinutes(Math.max(1, Math.min(480, Number(event.target.value) || 1)))}
                  className="max-w-24"
                />
              )}
            </div>
          </fieldset>

          <fieldset disabled={pending}>
            <legend className={cn(sectionTitle, "mb-1.5")}>3 · What is your goal?</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {GOALS.map((item) => (
                <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-2.5 text-sm has-checked:border-primary has-checked:bg-primary-soft">
                  <input type="radio" name="session-goal" value={item.id} checked={goal === item.id} onChange={() => setGoal(item.id)} className="mt-0.5 h-4 w-4 accent-primary" />
                  <span className="flex flex-col">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset disabled={pending}>
            <legend className={cn(sectionTitle, "mb-1.5")}>4 · Study method</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[...recommended, ...BUILDER_METHOD_IDS.filter((id) => !recommended.includes(id))].map((id) => {
                const info = STUDY_METHOD_BY_ID[id];
                const disabled = methodDisabled(id);
                const isRecommended = recommended.includes(id);
                return (
                  <label
                    key={id}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm has-checked:border-primary has-checked:bg-primary-soft",
                      disabled && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <input type="radio" name="session-method" value={id} checked={method === id} disabled={disabled} onChange={() => chooseMethod(id)} className="mt-0.5 h-4 w-4 accent-primary" />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-1.5 font-medium">
                        {info.name}
                        {isRecommended && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Recommended</span>}
                      </span>
                      <span className="text-xs text-muted-foreground">{info.summary}</span>
                      {disabled && (
                        <span className="text-xs text-muted-foreground">
                          {id === "error_review" ? "No open mistakes to retest yet." : id === "spaced_repetition" ? "No flashcards are due right now." : id === "interleaving" ? "Needs at least two processed materials." : "Needs a processed material."}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{behaviour.behaviour}</p>
          </fieldset>

          {method === "interleaving" && (
            <fieldset disabled={pending}>
              <legend className="mb-1.5 text-sm font-medium">Materials to mix in (up to three more)</legend>
              <ul className="grid grid-cols-1 gap-1 rounded-lg border border-border p-2 sm:grid-cols-2">
                {materials
                  .filter((material) => material.id !== materialId)
                  .map((material) => (
                    <li key={material.id}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                        <input
                          type="checkbox"
                          name="interleave-material"
                          value={material.id}
                          checked={extraMaterials.includes(material.id)}
                          disabled={!extraMaterials.includes(material.id) && extraMaterials.length >= 3}
                          onChange={() => setExtraMaterials((state) => (state.includes(material.id) ? state.filter((id) => id !== material.id) : [...state, material.id]))}
                          className="mt-0.5 h-4 w-4 accent-primary"
                        />
                        <span className="min-w-0">
                          <span className="block truncate">{material.title}</span>
                          {material.subject && <span className="block truncate text-xs text-muted-foreground">{material.subject}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
              </ul>
            </fieldset>
          )}

          {method === "practice_problems" && (
            <fieldset disabled={pending}>
              <legend className="mb-1.5 text-sm font-medium">Difficulty</legend>
              <div className="flex flex-wrap gap-2">
                {(["adaptive", ...PROBLEM_DIFFICULTIES] as const).map((level) => (
                  <Button key={level} type="button" size="sm" variant={problemDifficulty === level ? "primary" : "secondary"} aria-pressed={problemDifficulty === level} onClick={() => setProblemDifficulty(level)}>
                    {PROBLEM_DIFFICULTY_LABEL[level]}
                  </Button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{problemDifficulty === "adaptive" ? "Follows each concept's next difficulty from your mastery." : `Every problem is ${PROBLEM_DIFFICULTY_LABEL[problemDifficulty].toLowerCase()}.`}</p>
            </fieldset>
          )}

          {isTest && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <fieldset disabled={pending}>
                <legend className="mb-1.5 text-sm font-medium">Questions</legend>
                <div className="flex flex-wrap gap-2">
                  {[10, 20, 50].map((count) => (
                    <Button key={count} type="button" size="sm" variant={questionCount === count ? "primary" : "secondary"} onClick={() => setQuestionCount(count)}>
                      {count}
                    </Button>
                  ))}
                  <Input aria-label="Custom question count" type="number" min={3} max={50} value={questionCount} onChange={(event) => setQuestionCount(Math.max(3, Math.min(50, Number(event.target.value) || 3)))} className="max-w-24" />
                </div>
              </fieldset>
              <fieldset disabled={pending}>
                <legend className="mb-1.5 text-sm font-medium">Timer</legend>
                {method === "exam_simulation" ? (
                  <p className="text-sm text-muted-foreground">Exam mode: {minutes} minutes, shuffled questions and options, no hints, automatic submission.</p>
                ) : (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={timed} onChange={(event) => setTimed(event.target.checked)} className="h-4 w-4 accent-primary" />
                    Timed — {minutes} minutes for the whole test
                  </label>
                )}
                {method === "mixed_practice" && <p className="mt-1 text-xs text-muted-foreground">All nine question types, shuffled.</p>}
              </fieldset>
            </div>
          )}

          {method === "pomodoro" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <fieldset disabled={pending}>
                <legend className="mb-1.5 text-sm font-medium">Work / break</legend>
                <div className="flex flex-wrap gap-2">
                  {POMODORO_PRESETS.map((preset) => (
                    <Button
                      key={`${preset.work}/${preset.rest}`}
                      type="button"
                      size="sm"
                      variant={pomodoro.work === preset.work && pomodoro.rest === preset.rest ? "primary" : "secondary"}
                      onClick={() => setPomodoro(preset)}
                    >
                      {preset.work}/{preset.rest}
                    </Button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <Input aria-label="Work minutes" type="number" min={1} max={120} value={pomodoro.work} onChange={(event) => setPomodoro({ ...pomodoro, work: Math.max(1, Math.min(120, Number(event.target.value) || 1)) })} className="max-w-20" />
                  <span className="text-muted-foreground">work /</span>
                  <Input aria-label="Break minutes" type="number" min={1} max={60} value={pomodoro.rest} onChange={(event) => setPomodoro({ ...pomodoro, rest: Math.max(1, Math.min(60, Number(event.target.value) || 1)) })} className="max-w-20" />
                  <span className="text-muted-foreground">break</span>
                </div>
              </fieldset>
              <Field id="session-topic" label="Current topic (optional)">
                <Input {...fieldA11y("session-topic")} value={topic} maxLength={120} placeholder="e.g. Chapter 4 problem set" disabled={pending} onChange={(event) => setTopic(event.target.value)} />
              </Field>
            </div>
          )}

          {pending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Sparkles className="h-4 w-4 animate-pulse text-primary" aria-hidden="true" />
              Preparing your session… {PREPARING[method] ?? ""}
            </p>
          )}
          <div className="flex justify-end border-t border-border pt-4">
            <Button type="submit" loading={pending}>
              {!pending && <Play className="h-4 w-4" aria-hidden="true" />}
              Start {STUDY_METHOD_BY_ID[method].name}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
