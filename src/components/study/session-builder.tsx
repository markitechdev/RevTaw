"use client";

import { ChevronDown, Play, Sparkles, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChipGroup } from "@/components/ui/chip-group";
import { Input } from "@/components/ui/input";
import { OptionCard } from "@/components/ui/option-card";
import { SearchInput } from "@/components/ui/search-input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { startSessionAction } from "@/lib/study/actions";
import { BUILDER_METHOD_IDS, isBuilderMethod, isTestMethod, METHOD_BEHAVIOR, RAPID_REVIEW_MINUTES, recommendMethods, TIME_PRESETS, type BuilderMethodId } from "@/lib/study/catalog";
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
  smart_study: "Tamari is planning the blocks from your data",
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
  pq4r: "preparing the chapter",
  dual_coding: "drawing the visuals",
  mind_mapping: "drawing the map",
  concept_mapping: "drawing the map",
  mnemonics: "writing the mnemonics",
  memory_palace: "setting up",
  story_method: "writing the stories",
  pre_testing: "writing the pre-test",
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
  savedMnemonics = {},
  preferredMethods = [],
}: {
  materials: BuilderMaterial[];
  defaultMinutes: number;
  openMistakes: number;
  dueCards: number;
  initialMethod?: string;
  initialMaterialId?: string;
  /** Saved mnemonics with a list to recall, per material id. */
  savedMnemonics?: Record<string, number>;
  /** Settings → Study: the student's favorite methods, listed with the recommendations. */
  preferredMethods?: BuilderMethodId[];
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
  const [freshVisuals, setFreshVisuals] = useState(false);
  const [freshMap, setFreshMap] = useState(false);
  const [practiceSaved, setPracticeSaved] = useState(false);
  const [pomodoro, setPomodoro] = useState<{ work: number; rest: number }>({ work: 25, rest: 5 });
  const [topic, setTopic] = useState("");
  const [extraMaterials, setExtraMaterials] = useState<string[]>([]);
  const [showAllMethods, setShowAllMethods] = useState(false);
  const [methodFilter, setMethodFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const allMethodsId = useId();

  const behavior = METHOD_BEHAVIOR[method];
  const needsMaterial = behavior.requiresMaterial;
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
        freshVisuals: method === "dual_coding" ? freshVisuals : undefined,
        freshMap: method === "mind_mapping" || method === "concept_mapping" ? freshMap : undefined,
        savedMnemonics: method === "mnemonics" ? practiceSaved && (savedMnemonics[materialId] ?? 0) > 0 : undefined,
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
    if (METHOD_BEHAVIOR[id].requiresMaterial && materials.length === 0) return true;
    return false;
  };

  const sectionTitle = "text-sm font-semibold";

  // Progressive disclosure (UI phase §7): the methods that fit the goal and the
  // student's favorites first; every other method behind "Show all methods".
  // The chosen method always stays in view (e.g. when it came from a link).
  const shortList = [...new Set([...recommended.slice(0, 4), ...preferredMethods.filter((id) => BUILDER_METHOD_IDS.includes(id)), method])];
  const needle = methodFilter.trim().toLowerCase();
  const otherMethods = BUILDER_METHOD_IDS.filter((id) => !shortList.includes(id) && (!needle || STUDY_METHOD_BY_ID[id].name.toLowerCase().includes(needle) || STUDY_METHOD_BY_ID[id].summary.toLowerCase().includes(needle)));

  const methodCard = (id: BuilderMethodId) => {
    const info = STUDY_METHOD_BY_ID[id];
    const disabled = methodDisabled(id);
    const isRecommended = recommended.slice(0, 4).includes(id);
    const isPreferred = preferredMethods.includes(id);
    return (
      <OptionCard
        key={id}
        name="session-method"
        value={id}
        checked={method === id}
        disabled={disabled}
        onChange={() => chooseMethod(id)}
        label={
          <span className="flex flex-wrap items-center gap-1.5">
            {info.name}
            {/* Ringed: on a picked (tinted) card a plain tinted badge would disappear. */}
            {isRecommended && (
              <Badge tone="primary" className="ring-1 ring-inset ring-primary/40">
                Recommended
              </Badge>
            )}
            {isPreferred && (
              <Badge tone="highlight">
                <Star className="h-3 w-3" aria-hidden="true" />
                Your pick
              </Badge>
            )}
          </span>
        }
        hint={
          <>
            {info.summary}
            {disabled && (
              <span className="block">
                {id === "error_review" ? "No open mistakes to retest yet." : id === "spaced_repetition" ? "No flashcards are due right now." : id === "interleaving" ? "Needs at least two processed materials." : "Needs a processed material."}
              </span>
            )}
          </>
        }
      />
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start a session</CardTitle>
        <CardDescription>Four quick choices. RevTaw suggests a method for your goal; every other one is a click away.</CardDescription>
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

          <div className="flex flex-col gap-2">
            <Segmented
              label="2 · How much time do you have?"
              hideLabel={false}
              name="session-minutes"
              value={customMinutes && method !== "rapid_review" ? "custom" : String(minutes)}
              onChange={(value) => {
                if (value === "custom") {
                  setCustomMinutes(true);
                  return;
                }
                setCustomMinutes(false);
                setMinutes(Number(value));
              }}
              options={[...timePresets.map((preset) => ({ value: String(preset), label: `${preset} min` })), ...(method !== "rapid_review" ? [{ value: "custom", label: "Custom" }] : [])]}
              className={cn(pending && "pointer-events-none opacity-60")}
            />
            {method === "rapid_review" && <span className="text-xs text-muted-foreground">Rapid review is 5, 10 or 15 minutes by design.</span>}
            {customMinutes && method !== "rapid_review" && (
              <Input
                aria-label="Custom minutes"
                type="number"
                min={1}
                max={480}
                value={minutes}
                disabled={pending}
                onChange={(event) => setMinutes(Math.max(1, Math.min(480, Number(event.target.value) || 1)))}
                className="max-w-24"
              />
            )}
          </div>

          <ChipGroup
            type="single"
            name="session-goal"
            legend={<span className={sectionTitle}>3 · What is your goal?</span>}
            value={goal}
            onChange={setGoal}
            options={GOALS.map((item) => ({ value: item.id, label: item.label, hint: item.hint, disabled: pending }))}
            look="card"
          />

          <fieldset disabled={pending}>
            <legend className={cn(sectionTitle, "mb-1.5")}>4 · Study method</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{shortList.map(methodCard)}</div>
            <button
              type="button"
              aria-expanded={showAllMethods}
              aria-controls={allMethodsId}
              onClick={() => setShowAllMethods((value) => !value)}
              className="touch-target relative mt-3 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              {showAllMethods ? "Show fewer methods" : `Show all ${BUILDER_METHOD_IDS.length} methods`}
              <ChevronDown className={cn("h-4 w-4 transition-transform duration-200", showAllMethods && "rotate-180")} aria-hidden="true" />
            </button>
            <div id={allMethodsId} hidden={!showAllMethods} className="mt-3 flex flex-col gap-3">
              <SearchInput wrapperClassName="max-w-xs" size="sm" aria-label="Filter study methods" value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)} placeholder="Filter methods" />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{otherMethods.map(methodCard)}</div>
              {otherMethods.length === 0 && <p className="text-sm text-muted-foreground">No other method matches “{methodFilter}”.</p>}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{behavior.behavior}</p>
          </fieldset>

          {method === "interleaving" && (
            <ChipGroup
              type="multiple"
              name="interleave-material"
              legend="Materials to mix in (up to three more)"
              value={extraMaterials}
              onChange={(next) => setExtraMaterials(next.slice(0, 3))}
              options={materials
                .filter((material) => material.id !== materialId)
                .map((material) => ({ value: material.id, label: material.title, hint: material.subject ?? undefined, disabled: pending || (!extraMaterials.includes(material.id) && extraMaterials.length >= 3) }))}
              look="card"
            />
          )}

          {method === "dual_coding" && <Switch checked={freshVisuals} disabled={pending} onChange={setFreshVisuals} label="Draw new visuals instead of reusing the saved ones" />}

          {(method === "mind_mapping" || method === "concept_mapping") && <Switch checked={freshMap} disabled={pending} onChange={setFreshMap} label="Draw a new map instead of opening the saved one" />}

          {method === "mnemonics" && (savedMnemonics[materialId] ?? 0) > 0 && (
            <Switch
              checked={practiceSaved}
              disabled={pending}
              onChange={setPracticeSaved}
              label={`Practice your ${savedMnemonics[materialId]} saved mnemonic${savedMnemonics[materialId] === 1 ? "" : "s"} for this material instead of new ones`}
            />
          )}

          {method === "practice_problems" && (
            <div className="flex flex-col gap-1">
              <Segmented
                label="Difficulty"
                hideLabel={false}
                name="problem-difficulty"
                value={problemDifficulty}
                onChange={setProblemDifficulty}
                options={(["adaptive", ...PROBLEM_DIFFICULTIES] as const).map((level) => ({ value: level, label: PROBLEM_DIFFICULTY_LABEL[level] }))}
              />
              <p className="text-xs text-muted-foreground">{problemDifficulty === "adaptive" ? "Follows each concept's next difficulty from your mastery." : `Every problem is ${PROBLEM_DIFFICULTY_LABEL[problemDifficulty].toLowerCase()}.`}</p>
            </div>
          )}

          {isTest && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Segmented
                  label="Questions"
                  hideLabel={false}
                  name="test-questions"
                  value={[10, 20, 50].includes(questionCount) ? String(questionCount) : "custom"}
                  onChange={(value) => setQuestionCount(value === "custom" ? 15 : Number(value))}
                  options={[{ value: "10", label: "10" }, { value: "20", label: "20" }, { value: "50", label: "50" }, { value: "custom", label: "Other" }]}
                />
                <Input aria-label="Custom question count" type="number" min={3} max={50} value={questionCount} disabled={pending} onChange={(event) => setQuestionCount(Math.max(3, Math.min(50, Number(event.target.value) || 3)))} className="max-w-24" />
              </div>
              <fieldset disabled={pending}>
                <legend className="mb-1.5 text-sm font-medium">Timer</legend>
                {method === "exam_simulation" ? (
                  <p className="text-sm text-muted-foreground">Exam mode: {minutes} minutes, shuffled questions and options, no hints, automatic submission.</p>
                ) : (
                  <Switch checked={timed} onChange={setTimed} disabled={pending} label={`Timed — ${minutes} minutes for the whole test`} />
                )}
                {method === "mixed_practice" && <p className="mt-1 text-xs text-muted-foreground">All nine question types, shuffled.</p>}
              </fieldset>
            </div>
          )}

          {method === "pomodoro" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <fieldset disabled={pending}>
                <legend className="mb-1.5 text-sm font-medium">Work / break</legend>
                <Segmented
                  label="Work / break presets"
                  name="pomodoro-preset"
                  value={POMODORO_PRESETS.some((preset) => preset.work === pomodoro.work && preset.rest === pomodoro.rest) ? `${pomodoro.work}/${pomodoro.rest}` : "custom"}
                  onChange={(value) => {
                    const preset = POMODORO_PRESETS.find((item) => `${item.work}/${item.rest}` === value);
                    if (preset) setPomodoro(preset);
                  }}
                  options={[...POMODORO_PRESETS.map((preset) => ({ value: `${preset.work}/${preset.rest}`, label: `${preset.work}/${preset.rest}` })), ...(POMODORO_PRESETS.some((preset) => preset.work === pomodoro.work && preset.rest === pomodoro.rest) ? [] : [{ value: "custom", label: "Custom" }])]}
                />
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
