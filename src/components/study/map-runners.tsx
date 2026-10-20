"use client";

import { Workflow } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/forms/form-alert";
import { MindMapEditor } from "@/components/study/mind-map-editor";
import { RecallCard, RunnerSummary, useSessionCompletion, type RunnerProps } from "@/components/study/runner-kit";
import { SessionHeader } from "@/components/study/session-header";
import type { MapView } from "@/lib/study/flows/maps";
import type { MindMapData, MindNode } from "@/lib/study/maps";
import { quizBranchAction } from "@/lib/study/method-actions";
import type { RecallItemResult } from "@/lib/study/service";

type BranchQuestion = { id: string; prompt: string; branch: string; result: RecallItemResult | null };

/**
 * Mind mapping (§16): the editable map plus "quiz me on this branch" —
 * recall questions about the chosen branch, answered right below the map.
 */
export function MindMapRunner({ session, methodName, map, parentSessionId = null, parentLabel = "Back to smart session" }: RunnerProps & { map: MapView<MindMapData> | null }) {
  const { summary, stoppedEarly, ending, error, setError, finish } = useSessionCompletion(session);
  const [questions, setQuestions] = useState<BranchQuestion[]>(() =>
    session.items
      .filter((item) => item.format === "branch")
      .map((item) => ({
        id: item.id,
        prompt: item.prompt,
        branch: (item.analysis as { branchLabel?: string } | null)?.branchLabel ?? "",
        result: item.answered_at && (item.analysis as { verdict?: string } | null)?.verdict ? { comparison: item.analysis as unknown as RecallItemResult["comparison"], isCorrect: Boolean(item.is_correct), modelAnswer: item.model_answer ?? "", sourceExcerpt: item.source_excerpt } : null,
      })),
  );
  const [busy, setBusy] = useState<string | null>(null);

  if (summary) return <RunnerSummary methodName={methodName} summary={summary} stoppedEarly={stoppedEarly} parentSessionId={parentSessionId} parentLabel={parentLabel} />;
  if (!map) return <Alert tone="error">This session&apos;s mind map is no longer available. Start a new Mind Mapping session.</Alert>;
  const answered = questions.filter((question) => question.result).length;

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
      <SessionHeader title={session.title} methodName={methodName} startedAt={session.started_at} plannedMinutes={session.planned_minutes} progressLabel={`${answered} branch question${answered === 1 ? "" : "s"} answered`} onEnd={() => finish(answered === 0)} ending={ending} endLabel="Finish session" />
      {error && <Alert tone="error">{error}</Alert>}
      <section aria-labelledby="mind-map-title" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
        <h2 id="mind-map-title" className="flex items-center gap-2 text-lg font-medium">
          <Workflow className="h-5 w-5 text-primary" aria-hidden="true" />
          {map.title}
        </h2>
        <p className="text-sm text-muted-foreground">Expand and fold branches, rename ideas, add your own, connect ideas across branches — and press the question mark on any branch to be quizzed on it.</p>
        <MindMapEditor mapId={map.id} initial={map.data} onQuiz={quiz} quizBusy={busy} />
      </section>
      {questions.length > 0 && (
        <section aria-labelledby="branch-questions" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
          <h2 id="branch-questions" className="text-lg font-medium">
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
