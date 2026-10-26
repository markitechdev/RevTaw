import "server-only";

import { normalizeConceptName } from "@/lib/concepts/service";
import { loadMaterialContext } from "@/lib/reviewers/service";
import { generateRecallQuestions } from "@/lib/study/ai";
import { conceptsFor, insertItems, loadOpenItem, openSession, recordItemResult, type Client, type FlowStartInput, type FlowStartResult, type ItemRow } from "@/lib/study/items";
import { conceptMapSchema, mindMapSchema } from "@/lib/study/map-schemas";
import { labelOf, RELATION_LABEL, subtreeIds, type ConceptMapData, type ConceptRelation, type MindMapData } from "@/lib/study/maps";
import { sameRelation } from "@/lib/study/relations";
import { generateConceptMap, generateMindMap } from "@/lib/study/prompts/maps";
import { loadSession, SessionError, sessionTitle } from "@/lib/study/sessions";
import type { Json, StudyMapKind, StudySession } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { titleWithSuffix } from "@/lib/text/clamp";

/**
 * Mind mapping and concept mapping (§16). Maps are saved in `study_maps` and
 * edited in place (every save is validated); a session opens the material's
 * latest map — or draws a new one — and the student studies with it: recall
 * questions generated from a mind-map branch, or a test of a concept map's
 * relationships, both graded and fed to mastery like any other item.
 */

export type MapStartInput = FlowStartInput & { freshMap?: boolean };
export type MapView<T> = { id: string; title: string; data: T };

async function latestMap(supabase: Client, materialId: string, kind: StudyMapKind): Promise<{ id: string; title: string; data: unknown } | null> {
  const { data } = await supabase.from("study_maps").select("id, title, data").eq("material_id", materialId).eq("kind", kind).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return data ?? null;
}

async function startMapSession(supabase: Client, userId: string, input: MapStartInput, kind: "mind" | "concept"): Promise<FlowStartResult> {
  const context = await loadMaterialContext(supabase, input.materialId!);
  let mapId: string | null = null;
  if (!input.freshMap) {
    const saved = await latestMap(supabase, context.material.id, kind);
    const valid = saved ? (kind === "mind" ? mindMapSchema : conceptMapSchema).safeParse(saved.data).success : false;
    if (saved && valid) mapId = saved.id;
  }
  if (!mapId) {
    const generated = kind === "mind" ? await generateMindMap({ materialTitle: context.material.title, chunks: context.chunks, student: context.student }) : await generateConceptMap({ materialTitle: context.material.title, chunks: context.chunks, student: context.student });
    const { data: map, error } = await supabase
      .from("study_maps")
      .insert({ user_id: userId, material_id: context.material.id, kind, title: titleWithSuffix(context.material.title, kind === "mind" ? "mind map" : "concept map"), data: generated.map as unknown as Json, provider: generated.provider, model: generated.model })
      .select("id")
      .single();
    if (error || !map) throw new Error(`study_maps: insert failed: ${error?.message}`);
    mapId = map.id;
  }
  const method = kind === "mind" ? "mind_mapping" : "concept_mapping";
  const sessionId = await openSession(supabase, userId, {
    method,
    materialId: context.material.id,
    subjectId: context.material.subject_id,
    goal: input.goal ?? "understand",
    plannedMinutes: input.plannedMinutes,
    title: sessionTitle(method, context.material.title),
    state: { index: 0, mapId },
  });
  return { sessionId, redirect: `/study/${sessionId}` };
}

export function startMindMapping(supabase: Client, userId: string, input: MapStartInput): Promise<FlowStartResult> {
  return startMapSession(supabase, userId, input, "mind");
}

export function startConceptMapping(supabase: Client, userId: string, input: MapStartInput): Promise<FlowStartResult> {
  return startMapSession(supabase, userId, input, "concept");
}

/** The map a map session works on (null when it was deleted). */
export async function getSessionMap(session: Pick<StudySession, "state" | "method">): Promise<MapView<MindMapData> | MapView<ConceptMapData> | null> {
  const mapId = (session.state as { mapId?: string } | null)?.mapId;
  if (!mapId) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("study_maps").select("id, title, data, kind").eq("id", mapId).maybeSingle();
  if (!data) return null;
  const parsed = (data.kind === "mind" ? mindMapSchema : conceptMapSchema).safeParse(data.data);
  return parsed.success ? ({ id: data.id, title: data.title, data: parsed.data } as MapView<MindMapData> | MapView<ConceptMapData>) : null;
}

/** Saves an edited map after validating its structure (one center, no loops, links between known nodes). */
export async function saveMap(input: { mapId: string; kind: "mind" | "concept"; data: unknown }): Promise<void> {
  const parsed = (input.kind === "mind" ? mindMapSchema : conceptMapSchema).safeParse(input.data);
  if (!parsed.success) throw new SessionError(parsed.error.issues[0]?.message ?? "That map could not be saved.", 400);
  const supabase = await createClient();
  const { data, error } = await supabase.from("study_maps").update({ data: parsed.data as unknown as Json }).eq("id", input.mapId).eq("kind", input.kind).select("id");
  if (error) throw new Error(`study_maps: update failed: ${error.message}`);
  if (!data?.length) throw new SessionError("Map not found.", 404);
}

async function loadMapSession(supabase: Client, sessionId: string, method: "mind_mapping" | "concept_mapping"): Promise<StudySession> {
  const session = await loadSession(supabase, sessionId);
  if (session.status !== "in_progress") throw new SessionError("This session is already finished.", 409);
  if (session.method !== method) throw new SessionError("This session does not use that map.", 400);
  return session;
}

async function nextPosition(supabase: Client, sessionId: string): Promise<number> {
  const { count } = await supabase.from("study_session_items").select("id", { count: "exact", head: true }).eq("session_id", sessionId);
  return count ?? 0;
}

export type BranchQuestion = { id: string; prompt: string };

/** "Generate questions from branches": recall prompts on one branch of the mind map, answered inline. */
export async function quizBranch(input: { sessionId: string; nodeId: string }): Promise<BranchQuestion[]> {
  const supabase = await createClient();
  const session = await loadMapSession(supabase, input.sessionId, "mind_mapping");
  const map = await getSessionMap(session);
  if (!map || !("links" in map.data)) throw new SessionError("This session's map is missing.", 404);
  const mind = map.data as MindMapData;
  const branch = mind.nodes.find((node) => node.id === input.nodeId);
  if (!branch) throw new SessionError("That branch is not on the map.", 404);
  const labels = subtreeIds(mind, branch.id)
    .map((id) => mind.nodes.find((node) => node.id === id)?.label ?? "")
    .filter(Boolean)
    .slice(0, 8);
  const context = await loadMaterialContext(supabase, session.material_id!);
  const generated = await generateRecallQuestions({ materialTitle: context.material.title, chunks: context.chunks, count: 3, focusConcepts: labels, recentMistakes: [], student: context.student, emphasis: labels, knownConcepts: context.knownConcepts });
  if (generated.questions.length === 0) throw new SessionError("No questions could be written for that branch.", 422);
  const concepts = await conceptsFor(supabase, session.user_id, context, generated.questions.map((question) => question.concept));
  const start = await nextPosition(supabase, session.id);
  const rows: ItemRow[] = generated.questions.map((question, index) => ({
    session_id: session.id,
    user_id: session.user_id,
    position: start + index,
    kind: "recall",
    concept_id: concepts.get(normalizeConceptName(question.concept)) ?? null,
    prompt: question.prompt,
    model_answer: question.model_answer,
    key_points: question.key_points as unknown as Json,
    source_excerpt: question.source_excerpt || null,
    format: "branch",
    analysis: { branch: branch.id, branchLabel: branch.label } as unknown as Json,
  }));
  const { data, error } = await supabase.from("study_session_items").insert(rows).select("id, prompt, position");
  if (error) throw new Error(`study_session_items: insert failed: ${error.message}`);
  return [...(data ?? [])].sort((a, b) => a.position - b.position).map((row) => ({ id: row.id, prompt: row.prompt }));
}

export type LinkQuestion = { id: string; from: string; to: string; answered: boolean };

/** "Test the links": up to eight of the concept map's relationships, relation hidden. */
export async function startLinkTest(input: { sessionId: string }): Promise<LinkQuestion[]> {
  const supabase = await createClient();
  const session = await loadMapSession(supabase, input.sessionId, "concept_mapping");
  const { data: open } = await supabase.from("study_session_items").select("id, analysis").eq("session_id", session.id).eq("kind", "link").is("answered_at", null);
  if (open?.length) return open.map((row) => ({ id: row.id, ...((row.analysis as { from: string; to: string }) ?? { from: "?", to: "?" }), answered: false }));
  const map = await getSessionMap(session);
  if (!map || !("edges" in map.data)) throw new SessionError("This session's map is missing.", 404);
  const concept = map.data as ConceptMapData;
  const edges = concept.edges.slice(0, 8);
  if (edges.length === 0) throw new SessionError("Add a relationship to the map first.", 400);
  const context = await loadMaterialContext(supabase, session.material_id!);
  const concepts = await conceptsFor(supabase, session.user_id, context, edges.map((edge) => labelOf(concept, edge.from)));
  const start = await nextPosition(supabase, session.id);
  await insertItems(
    supabase,
    edges.map((edge, index) => ({
      session_id: session.id,
      user_id: session.user_id,
      position: start + index,
      kind: "link" as const,
      concept_id: concepts.get(normalizeConceptName(labelOf(concept, edge.from))) ?? null,
      prompt: `How does ${labelOf(concept, edge.from)} relate to ${labelOf(concept, edge.to)}?`,
      // The relation and the material's note stay hidden until the link is answered.
      model_answer: JSON.stringify({ relation: edge.relation, note: edge.note ?? null }),
      key_points: [] as unknown as Json,
      source_excerpt: null,
      format: "link",
      analysis: { from: labelOf(concept, edge.from), to: labelOf(concept, edge.to) } as unknown as Json,
    })),
  );
  const { data: created } = await supabase.from("study_session_items").select("id, analysis").eq("session_id", session.id).eq("kind", "link").is("answered_at", null).order("position");
  return (created ?? []).map((row) => ({ id: row.id, ...(row.analysis as { from: string; to: string }), answered: false }));
}

export type LinkResult = { isCorrect: boolean; relation: ConceptRelation; note: string | null };

export async function answerLink(input: { itemId: string; relation: ConceptRelation; responseMs: number | null }): Promise<LinkResult> {
  const supabase = await createClient();
  const { item, session } = await loadOpenItem(supabase, input.itemId);
  if (item.kind !== "link") throw new SessionError("This item is not a relationship.", 400);
  const key = JSON.parse(item.model_answer ?? "{}") as { relation?: ConceptRelation; note?: string | null };
  if (!key.relation) throw new SessionError("This relationship is incomplete.", 422);
  const relation = key.relation;
  const note = key.note ?? null;
  if (item.answered_at) return { isCorrect: Boolean(item.is_correct), relation, note };
  // "causes" and "leads to", "requires" and "depends on" say the same thing: either counts.
  const isCorrect = sameRelation(RELATION_LABEL[input.relation], RELATION_LABEL[relation]);
  const { from, to } = (item.analysis as { from: string; to: string }) ?? { from: "?", to: "?" };
  await recordItemResult(supabase, item, session, {
    response: input.relation,
    analysis: { from, to, given: input.relation } as unknown as Json,
    score: isCorrect ? 100 : 0,
    isCorrect,
    responseMs: input.responseMs,
    mistake: { question: item.prompt, correctAnswer: `${from} ${RELATION_LABEL[relation]} ${to}`, explanation: note ?? "Look at how the material connects these concepts.", errorType: "confused_concepts" },
  });
  return { isCorrect, relation, note };
}
