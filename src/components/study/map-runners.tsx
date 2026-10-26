"use client";

import { Check, CircleCheck, CircleX, Network, Workflow } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/forms/form-alert";
import { ConceptMapEditor } from "@/components/study/concept-map-editor";
import { MindMapEditor } from "@/components/study/mind-map-editor";
import { RecallCard, RunnerSummary, useSessionCompletion, type RunnerProps } from "@/components/study/runner-kit";
import { SessionHeader } from "@/components/study/session-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { TINT } from "@/components/ui/tint";
import type { LinkQuestion, LinkResult, MapView } from "@/lib/study/flows/maps";
import { CONCEPT_RELATIONS, RELATION_LABEL, type ConceptMapData, type ConceptRelation, type MindMapData, type MindNode } from "@/lib/study/maps";
import { answerLinkAction, quizBranchAction, startLinkTestAction } from "@/lib/study/method-actions";
import { recallResultOf, type RecallItemResult } from "@/lib/study/results";
import { cn } from "@/lib/utils";

type BranchQuestion = { id: string; prompt: string; branch: string; result: RecallItemResult | null };

/**
 * Mind mapping (§16): the editable map plus "quiz me on this branch" —
 * recall questions about the chosen branch, answered right below the map.
 */
export function MindMapRunner({ session, methodName, map, parentSessionId = null, parentLabel = "Back to Tamari's plan" }: RunnerProps & { map: MapView<MindMapData> | null }) {
  const { summary, stoppedEarly, ending, error, setError, finish } = useSessionCompletion(session);
  const [questions, setQuestions] = useState<BranchQuestion[]>(() =>
    session.items
      .filter((item) => item.format === "branch")
      .map((item) => ({
        id: item.id,
        prompt: item.prompt,
        branch: (item.analysis as { branchLabel?: string } | null)?.branchLabel ?? "",
        result: recallResultOf(item),
      })),
  );
  const [busy, setBusy] = useState<string | null>(null);

  if (summary) return <RunnerSummary methodName={methodName} summary={summary} stoppedEarly={stoppedEarly} parentSessionId={parentSessionId} parentLabel={parentLabel} />;
  if (!map) return <Alert tone="error">This session&apos;s mind map is no longer available. Start a new Mind Mapping session.</Alert>;
  const answered = questions.filter((question) => question.result).length;
  // The questions are answered from memory: the map (which holds the answers) is hidden until they are.
  const answering = questions.some((question) => !question.result);

  const quiz = async (node: MindNode) => {
    setError(null);
    setBusy(node.id);
    const result = await quizBranchAction({ sessionId: session.id, nodeId: node.id });
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setQuestions((state) => [...result.data.map((question) => ({ id: question.id, prompt: question.prompt, branch: node.label, result: null })), ...state]);
  };

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader title={session.title} methodName={methodName} startedAt={session.started_at} plannedMinutes={session.planned_minutes} progressLabel={`${answered} branch question${answered === 1 ? "" : "s"} answered`} onEnd={() => finish()} ending={ending} endLabel="Finish session" />
      {error && <Alert tone="error">{error}</Alert>}
      <section aria-labelledby="mind-map-title" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <h2 id="mind-map-title" className="font-display tracking-display flex items-center gap-2 text-lg font-medium">
          <Workflow className="h-5 w-5 text-primary" aria-hidden="true" />
          {map.title}
        </h2>
        {answering ? (
          <p className={`rounded-lg border p-3 text-sm ${TINT.info}`}>The map is hidden while you answer the branch questions from memory. It comes back once they are all answered.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Expand and fold branches, rename ideas, add your own, connect ideas across branches — and press the question mark on any branch to be quizzed on it.</p>
            <MindMapEditor mapId={map.id} initial={map.data} onQuiz={quiz} quizBusy={busy} />
          </>
        )}
      </section>
      {questions.length > 0 && (
        <section aria-labelledby="branch-questions" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <h2 id="branch-questions" className="font-display tracking-display text-lg font-medium">
            Branch questions
          </h2>
          {questions.map((question) => (
            <div key={question.id} className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">From the branch “{question.branch}”</p>
              <RecallCard itemId={question.id} prompt={question.prompt} initial={question.result} onAnswered={(result) => setQuestions((state) => state.map((entry) => (entry.id === question.id ? { ...entry, result } : entry)))} />
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

/**
 * Concept mapping (§16): edit the map, then "test the links" — every
 * relationship hidden, named from memory, checked and explained.
 */
export function ConceptMapRunner({ session, methodName, map, parentSessionId = null, parentLabel = "Back to Tamari's plan" }: RunnerProps & { map: MapView<ConceptMapData> | null }) {
  const { summary, stoppedEarly, ending, error, setError, finish, pending, startTransition } = useSessionCompletion(session);
  const openLinks = session.items.filter((item) => item.kind === "link");
  const [mode, setMode] = useState<"edit" | "test">(() => (openLinks.some((item) => !item.answered_at) ? "test" : "edit"));
  const [links, setLinks] = useState<LinkQuestion[]>(() => openLinks.filter((item) => !item.answered_at).map((item) => ({ id: item.id, ...((item.analysis as { from: string; to: string }) ?? { from: "?", to: "?" }), answered: false })));
  const [choices, setChoices] = useState<Record<string, ConceptRelation | "">>({});
  const [results, setResults] = useState<Record<string, LinkResult>>({});

  if (summary) return <RunnerSummary methodName={methodName} summary={summary} stoppedEarly={stoppedEarly} parentSessionId={parentSessionId} parentLabel={parentLabel} />;
  if (!map) return <Alert tone="error">This session&apos;s concept map is no longer available. Start a new Concept Mapping session.</Alert>;

  const startTest = () => {
    setError(null);
    startTransition(async () => {
      const result = await startLinkTestAction({ sessionId: session.id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setLinks(result.data);
      setResults({});
      setChoices({});
      setMode("test");
    });
  };

  const answer = (link: LinkQuestion) => {
    const relation = choices[link.id];
    if (!relation) return;
    setError(null);
    startTransition(async () => {
      const result = await answerLinkAction({ itemId: link.id, relation, responseMs: null });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setResults((state) => ({ ...state, [link.id]: result.data }));
    });
  };

  const allDone = links.length > 0 && links.every((link) => results[link.id]);

  return (
    <div className="flex flex-col gap-4">
      <SessionHeader title={session.title} methodName={methodName} startedAt={session.started_at} plannedMinutes={session.planned_minutes} progressLabel={mode === "test" ? `${Object.keys(results).length} of ${links.length} links named` : "editing the map"} onEnd={() => finish()} ending={ending} endLabel="Finish session" />
      {error && <Alert tone="error">{error}</Alert>}
      <section aria-labelledby="concept-map-title" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="concept-map-title" className="font-display tracking-display flex items-center gap-2 text-lg font-medium">
            <Network className="h-5 w-5 text-primary" aria-hidden="true" />
            {map.title}
          </h2>
          {mode === "edit" ? (
            <Button type="button" size="sm" loading={pending} onClick={startTest}>
              Test the links
            </Button>
          ) : (
            // The map shows every relationship: it opens again once the test is done, not halfway through it.
            allDone && (
              <Button type="button" size="sm" variant="secondary" onClick={() => setMode("edit")}>
                Back to the map
              </Button>
            )
          )}
        </div>
        {mode === "edit" ? (
          <ConceptMapEditor mapId={map.id} title={map.title} initial={map.data} />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">The relationships are hidden. Name each one from memory.</p>
            <ul className="flex flex-col gap-2">
              {links.map((link) => {
                const result = results[link.id];
                return (
                  <li key={link.id} className={cn("flex flex-col gap-2 rounded-lg border border-border p-3 text-sm", result && (result.isCorrect ? TINT.success : TINT.danger))}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{link.from}</span>
                      <Select aria-label={`Relationship from ${link.from} to ${link.to}`} value={choices[link.id] ?? ""} disabled={Boolean(result) || pending} onChange={(event) => setChoices((state) => ({ ...state, [link.id]: event.target.value as ConceptRelation }))} className="w-44">
                        <option value="">Choose…</option>
                        {CONCEPT_RELATIONS.map((option) => (
                          <option key={option} value={option}>
                            {RELATION_LABEL[option]}
                          </option>
                        ))}
                      </Select>
                      <span className="font-medium">{link.to}</span>
                      {!result && (
                        <Button type="button" size="sm" variant="secondary" disabled={!choices[link.id] || pending} onClick={() => answer(link)}>
                          <Check className="h-4 w-4" aria-hidden="true" />
                          Check
                        </Button>
                      )}
                    </div>
                    {result && (
                      <p className="flex items-start gap-1.5" role="status">
                        {result.isCorrect ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />}
                        <span>
                          {result.isCorrect ? "Correct" : "Not quite"}: {link.from} {RELATION_LABEL[result.relation]} {link.to}.{result.note ? ` ${result.note}` : ""}
                        </span>
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            {allDone && (
              <div className="flex justify-end border-t border-border pt-4">
                <Button type="button" size="sm" loading={ending} onClick={() => finish()}>
                  Finish session
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
