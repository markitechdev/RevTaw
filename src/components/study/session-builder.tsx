"use client";

import { ChevronDown, Lock, Play, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";

import { Field, fieldA11y } from "@/components/forms/field";
import { Alert } from "@/components/forms/form-alert";
import { DuplicateSessionDialog } from "@/components/study/duplicate-session-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChipGroup } from "@/components/ui/chip-group";
import { Input } from "@/components/ui/input";
import { OptionCard } from "@/components/ui/option-card";
import { SearchInput } from "@/components/ui/search-input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TINT } from "@/components/ui/tint";
import { routes } from "@/lib/routes";
import { startSessionAction } from "@/lib/study/actions";
import { BUILDER_METHOD_IDS, defaultBuilderMethod, isBuilderMethod, isTestMethod, LOCK_REASON, METHOD_BEHAVIOR, methodLock, RAPID_REVIEW_MINUTES, recommendMethods, TIME_PRESETS, type BuilderMethodId, type MethodCounts } from "@/lib/study/catalog";
import { STUDY_METHOD_BY_ID } from "@/lib/study/methods";
import { PROBLEM_DIFFICULTIES, PROBLEM_DIFFICULTY_LABEL, type ProblemDifficulty } from "@/lib/study/problem-options";
import { isSessionDuplicate, type SessionDuplicate } from "@/lib/study/session-duplicate";
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
  cornell_notes: "preparing the sections",
  dual_coding: "drawing the visuals",
  mind_mapping: "drawing the map",
  concept_mapping: "drawing the map",
  mnemonics: "writing the mnemonics",
  memory_palace: "setting up",
  story_method: "writing the stories",
  pre_testing: "writing the pre-test",
};

/** The student's materials that aren't processed yet, counted by the Study page: still being prepared, or failed. */
export type WaitingMaterials = { preparing: number; failed: number };

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
  waitingMaterials = { preparing: 0, failed: 0 },
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
  /** Uploads not processed yet: what the note over the locked methods says while there is no processed material. */
  waitingMaterials?: WaitingMaterials;
}) {
  const router = useRouter();
  const counts: MethodCounts = { materials: materials.length, openMistakes, dueCards };
  const lockOf = (id: BuilderMethodId) => methodLock(id, counts);
  const [materialId, setMaterialId] = useState<string>(initialMaterialId && materials.some((m) => m.id === initialMaterialId) ? initialMaterialId : (materials[0]?.id ?? ""));
  const [minutes, setMinutes] = useState<number>(initialMethod === "rapid_review" ? 10 : defaultMinutes);
  const [customMinutes, setCustomMinutes] = useState(initialMethod !== "rapid_review" && !(TIME_PRESETS as readonly number[]).includes(defaultMinutes));
  const [goal, setGoal] = useState<SessionGoal>("practice");
  const [method, setMethod] = useState<BuilderMethodId>(() => (initialMethod && isBuilderMethod(initialMethod) ? initialMethod : defaultBuilderMethod(counts)));
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
  // An unfinished session like this one, found when Start was pressed: the student picks what to do.
  const [duplicate, setDuplicate] = useState<SessionDuplicate | null>(null);
  const [pending, startTransition] = useTransition();
  const allMethodsId = useId();

  const behavior = METHOD_BEHAVIOR[method];
  const needsMaterial = behavior.requiresMaterial;
  const effectiveMaterial = needsMaterial || materialId !== "none" ? materialId : "";
  const recommended = useMemo(() => recommendMethods(goal, Boolean(effectiveMaterial && effectiveMaterial !== "none")), [goal, effectiveMaterial]);
  const isTest = isTestMethod(method);
  const timePresets: readonly number[] = method === "rapid_review" ? RAPID_REVIEW_MINUTES : TIME_PRESETS;

  const start = (allowDuplicate = false) => {
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
        allowDuplicate,
      });
      if (!result.ok) {
        setDuplicate(null);
        setError(result.message);
        return;
      }
      if (isSessionDuplicate(result.data)) {
        setDuplicate(result.data);
        return;
      }
      // The dialog (if any) stays open, busy, until the session's page takes over.
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

  const sectionTitle = "text-sm font-semibold";

  // Without a processed material, most methods are locked: one note says why and how to unlock them, instead
  // of the same line on every card.
  const waitingCount = waitingMaterials.preparing || waitingMaterials.failed;
  const your = waitingCount === 1 ? "Your material" : "Your materials";
  const lockedNote =
    materials.length > 0
      ? null
      : waitingMaterials.preparing > 0
        ? { text: `Most methods build their questions from your notes, so they unlock when ${your.toLowerCase()} ${waitingCount === 1 ? "is" : "are"} ready.`, action: null }
        : waitingMaterials.failed > 0
          ? { text: `Most methods build their questions from your notes. ${your} couldn't be prepared, so they're locked for now.`, action: { href: routes.materials, label: "Open Materials" } }
          : { text: "Most methods build their questions from your notes. Upload a material to unlock them.", action: { href: `${routes.materials}?upload=1`, label: "Upload a material" } };
  const worksWithout = BUILDER_METHOD_IDS.filter((id) => !METHOD_BEHAVIOR[id].requiresMaterial && !lockOf(id)).map((id) => STUDY_METHOD_BY_ID[id].name);
  const materialHint =
    materials.length > 0
      ? undefined
      : waitingMaterials.preparing > 0
        ? `${your} ${waitingCount === 1 ? "is" : "are"} still being prepared and will show up here when ready.`
        : waitingMaterials.failed > 0
          ? `${your} couldn't be prepared. Try again from Materials.`
          : `No materials yet. ${new Intl.ListFormat("en", { type: "conjunction" }).format(worksWithout)} ${worksWithout.length === 1 ? "works" : "work"} without one.`;

  // Progressive disclosure (UI phase §7): the methods that fit the goal and the
  // student's favorites first; every other method behind "Show all methods".
  // Only methods that can start now are recommended. The chosen method always
  // stays in view (e.g. when it came from a link).
  const recommendedNow = recommended.filter((id) => !lockOf(id)).slice(0, 4);
  const shortList = [...new Set([...recommendedNow, ...preferredMethods.filter((id) => BUILDER_METHOD_IDS.includes(id)), method])];
  const needle = methodFilter.trim().toLowerCase();
  const otherMethods = BUILDER_METHOD_IDS.filter((id) => !shortList.includes(id) && (!needle || STUDY_METHOD_BY_ID[id].name.toLowerCase().includes(needle) || STUDY_METHOD_BY_ID[id].summary.toLowerCase().includes(needle)));

  const methodCard = (id: BuilderMethodId) => {
    const info = STUDY_METHOD_BY_ID[id];
    const lock = lockOf(id);
    const isRecommended = recommendedNow.includes(id);
    const isPreferred = preferredMethods.includes(id);
    return (
      <OptionCard
        key={id}
        name="session-method"
        value={id}
        checked={method === id}
        disabled={lock !== null}
        onChange={() => chooseMethod(id)}
        label={
          <span className="flex flex-wrap items-center gap-1.5">
            {info.name}
            {lock && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
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
            {/* The note over the cards already says why for the methods that need a material; screen readers get it per card. */}
            {lock === "material" ? <span className="sr-only"> Locked: {LOCK_REASON.material}</span> : lock && <span className="block">{LOCK_REASON[lock]}</span>}
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

          <Field id="session-material" label="1 · What are you studying?" hint={materialHint}>
            <Select {...fieldA11y("session-material", undefined, materialHint)} value={materialId || "none"} disabled={pending} onChange={(event) => setMaterialId(event.target.value)}>
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
            {lockedNote && (
              <div className={cn("mb-2 flex flex-col items-start gap-2 rounded-xl border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between", TINT.info)}>
                <p className="flex items-start gap-2">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
                  {lockedNote.text}
                </p>
                {lockedNote.action && (
                  <Link href={lockedNote.action.href} className={cn(buttonClasses({ variant: "secondary", size: "sm" }), "shrink-0")}>
                    {lockedNote.action.label}
                  </Link>
                )}
              </div>
            )}
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
                {method === "mixed_practice" && <p className="mt-1 text-xs text-muted-foreground">Every question type, shuffled.</p>}
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
        <DuplicateSessionDialog duplicate={duplicate} starting={pending} onStartNew={() => start(true)} onCancel={() => setDuplicate(null)} />
      </CardContent>
    </Card>
  );
}
