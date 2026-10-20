import "server-only";

import { z } from "zod";

import { ensureConcepts, normalizeConceptName } from "@/lib/concepts/service";
import { parseAnalysisData } from "@/lib/materials/analysis-schema";
import { loadMaterialContext } from "@/lib/reviewers/service";
import { conceptsFor, insertItems, loadOpenItem, openSession, recordItemResult, type Client, type FlowStartInput, type FlowStartResult, type ItemRow } from "@/lib/study/items";
import {
  deviceMatchesItems,
  gradeListRecall,
  itemMatches,
  listScore,
  lociResultOf,
  lociViewOf,
  palaceLocationSchema,
  palaceStateOf,
  palaceStopCount,
  sameLocation,
  mnemonicCount,
  mnemonicViewOf,
  MNEMONIC_KIND_LABEL,
  targetIsOrdered,
  type LociKey,
  type LociResult,
  type LociView,
  type MnemonicItemView,
  type MnemonicOption,
  type MnemonicPracticeResult,
  type PalaceInput,
  type PalaceLocation,
  type PalacePlacement,
  type PalaceState,
  type PalaceSummary,
} from "@/lib/study/memory-options";
import { generateAssociations, generateMnemonics } from "@/lib/study/prompts/memory";
import { loadSession, SessionError, sessionTitle, updateSessionState } from "@/lib/study/sessions";
import type { Json, Mnemonic, MnemonicKind, StudySession } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Memory techniques (§16). Mnemonics: RevTaw finds the lists in a material
 * that are hard to memorize and offers accurate devices for each; the student
 * picks one (or writes their own), saves the ones that work and recalls the
 * list from the device alone. Saved mnemonics live in `mnemonics` and come
 * back for practice. Memory palace: the student defines a route of familiar
 * locations (`memory_palaces`), RevTaw places the material's key concepts
 * along it with a vivid image each, and the walk asks what sits at each stop.
 */

const MAX_OPTIONS = 6;

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export type MnemonicStartInput = FlowStartInput & { savedMnemonics?: boolean };

export async function startMnemonics(supabase: Client, userId: string, input: MnemonicStartInput): Promise<FlowStartResult> {
  const context = await loadMaterialContext(supabase, input.materialId!);
  const rows: Array<Omit<ItemRow, "session_id" | "position">> = [];
  let provider: string | null = null;

  if (input.savedMnemonics) {
    // Practice what the student saved for this material, least recently practiced first.
    const { data: saved } = await supabase
      .from("mnemonics")
      .select("id, kind, target, items, content, explanation, concept_id")
      .eq("material_id", context.material.id)
      .order("last_practiced_at", { ascending: true, nullsFirst: true })
      .limit(40);
    for (const mnemonic of (saved ?? []).filter((entry) => entry.items.length >= 2).slice(0, mnemonicCount(input.plannedMinutes, true))) {
      const view: MnemonicItemView = {
        target: mnemonic.target,
        items: mnemonic.items,
        ordered: targetIsOrdered(mnemonic.target),
        options: [{ kind: mnemonic.kind, content: mnemonic.content, explanation: mnemonic.explanation }],
        saved: { "0": mnemonic.id },
        fromSaved: mnemonic.id,
      };
      rows.push({ user_id: userId, kind: "mnemonic", concept_id: mnemonic.concept_id, prompt: mnemonic.target, model_answer: mnemonic.items.join("\n"), key_points: [] as unknown as Json, source_excerpt: null, format: "saved", analysis: view as unknown as Json });
    }
    if (rows.length === 0) throw new SessionError("You have no saved mnemonics with a list for this material yet. Start a session without that option to get new ones.", 400);
  } else {
    const generated = await generateMnemonics({ materialTitle: context.material.title, chunks: context.chunks, student: context.student, count: mnemonicCount(input.plannedMinutes) });
    provider = generated.provider;
    // Accuracy guard: drop an acronym or acrostic that does not spell the items in order.
    const targets = generated.targets
      .map((target) => ({ ...target, options: target.options.filter((option) => deviceMatchesItems(option, target.items)) }))
      .filter((target) => target.options.length > 0);
    if (targets.length === 0) throw new SessionError("No accurate mnemonics could be written for this material. Try again or pick another method.", 422);
    const concepts = await conceptsFor(supabase, userId, context, targets.map((target) => target.concept));
    for (const target of targets) {
      const view: MnemonicItemView = { target: target.target, items: target.items, ordered: target.ordered, options: target.options.map((option) => ({ kind: option.kind, content: option.content, explanation: option.explanation })), saved: {}, fromSaved: null };
      rows.push({ user_id: userId, kind: "mnemonic", concept_id: concepts.get(normalizeConceptName(target.concept)) ?? null, prompt: target.target, model_answer: target.items.join("\n"), key_points: [] as unknown as Json, source_excerpt: null, format: "generated", analysis: view as unknown as Json });
    }
  }

  const sessionId = await openSession(supabase, userId, {
    method: "mnemonics",
    materialId: context.material.id,
    subjectId: context.material.subject_id,
    goal: input.goal ?? "memorize",
    plannedMinutes: input.plannedMinutes,
    title: sessionTitle("mnemonics", context.material.title),
    state: { index: 0, provider, saved: Boolean(input.savedMnemonics) },
  });
  await insertItems(supabase, rows.map((row, position) => ({ ...row, session_id: sessionId, position })));
  return { sessionId, redirect: `/study/${sessionId}` };
}

async function loadMnemonicItem(supabase: Client, itemId: string) {
  const { item, session } = await loadOpenItem(supabase, itemId);
  if (item.kind !== "mnemonic") throw new SessionError("This item is not a mnemonic.", 400);
  const view = mnemonicViewOf(item.analysis);
  if (!view) throw new SessionError("This mnemonic is incomplete.", 422);
  return { item, session, view, analysis: (item.analysis as Record<string, unknown>) ?? {} };
}

async function insertMnemonic(supabase: Client, row: { userId: string; materialId: string | null; conceptId: string | null; kind: MnemonicKind; target: string; items: string[]; content: string; explanation: string | null; source: "ai" | "user" }): Promise<string> {
  const { data, error } = await supabase
    .from("mnemonics")
    .insert({
      user_id: row.userId,
      material_id: row.materialId,
      concept_id: row.conceptId,
      kind: row.kind,
      target: row.target.slice(0, 200),
      items: row.items.slice(0, 20).map((entry) => entry.slice(0, 200)),
      content: row.content.slice(0, 2000),
      explanation: row.explanation?.slice(0, 2000) || null,
      source: row.source,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`mnemonics: insert failed: ${error?.message}`);
  return data.id;
}

/** Saves one of an item's devices to the student's mnemonics (idempotent per option). */
export async function saveMnemonicOption(input: { itemId: string; optionIndex: number }): Promise<{ mnemonicId: string }> {
  const supabase = await createClient();
  const { item, session, view, analysis } = await loadMnemonicItem(supabase, input.itemId);
  const option = view.options[input.optionIndex];
  if (!option) throw new SessionError("That mnemonic is not part of this list.", 400);
  const existing = view.saved[String(input.optionIndex)];
  if (existing) return { mnemonicId: existing };
  const mnemonicId = await insertMnemonic(supabase, {
    userId: session.user_id,
    materialId: session.material_id,
    conceptId: item.concept_id,
    kind: option.kind,
    target: view.target,
    items: view.items,
    content: option.content,
    explanation: option.explanation,
    source: option.kind === "custom" ? "user" : "ai",
  });
  await supabase
    .from("study_session_items")
    .update({ analysis: { ...analysis, saved: { ...view.saved, [String(input.optionIndex)]: mnemonicId } } as unknown as Json })
    .eq("id", item.id);
  return { mnemonicId };
}

/** The student's own device for a list: added to the item's options and saved straight away. */
export async function addOwnMnemonic(input: { itemId: string; content: string; explanation: string | null }): Promise<{ option: MnemonicOption; optionIndex: number; mnemonicId: string }> {
  const supabase = await createClient();
  const { item, session, view, analysis } = await loadMnemonicItem(supabase, input.itemId);
  if (view.options.length >= MAX_OPTIONS) throw new SessionError("This list already has enough mnemonics.", 400);
  const option: MnemonicOption = { kind: "custom", content: input.content.trim(), explanation: input.explanation?.trim() || null };
  const optionIndex = view.options.length;
  const mnemonicId = await insertMnemonic(supabase, { userId: session.user_id, materialId: session.material_id, conceptId: item.concept_id, kind: "custom", target: view.target, items: view.items, content: option.content, explanation: option.explanation, source: "user" });
  await supabase
    .from("study_session_items")
    .update({ analysis: { ...analysis, options: [...view.options, option], saved: { ...view.saved, [String(optionIndex)]: mnemonicId } } as unknown as Json })
    .eq("id", item.id);
  return { option, optionIndex, mnemonicId };
}

/** Recall the list from the chosen device alone; graded per item and for order. */
export async function practiceMnemonic(input: { itemId: string; optionIndex: number; answer: string; responseMs: number | null }): Promise<MnemonicPracticeResult> {
  const supabase = await createClient();
  const { item, session, view, analysis } = await loadMnemonicItem(supabase, input.itemId);
  const stored = (analysis as { result?: MnemonicPracticeResult }).result;
  if (item.answered_at && stored) return stored;
  const chosen = view.options[input.optionIndex] ? input.optionIndex : 0;
  const option = view.options[chosen];
  const graded = gradeListRecall(view.items, input.answer);
  const score = listScore(graded, view.ordered && view.items.length > 1);
  const result: MnemonicPracticeResult = { score, marks: graded.marks, inOrder: graded.inOrder, isCorrect: score >= 80, chosen };
  await recordItemResult(supabase, item, session, {
    response: input.answer,
    analysis: { ...analysis, result } as unknown as Json,
    score,
    isCorrect: result.isCorrect,
    responseMs: input.responseMs,
    mistake: {
      question: `Recall from your mnemonic: ${view.target}`,
      correctAnswer: view.items.map((entry, index) => `${index + 1}. ${entry}`).join("\n"),
      explanation: `${MNEMONIC_KIND_LABEL[option.kind]}: ${option.content}${option.explanation ? ` — ${option.explanation}` : ""}`,
      errorType: "forgotten_information",
    },
  });
  const practiced = [...new Set([...Object.values(view.saved), view.fromSaved].filter((id): id is string => Boolean(id)))];
  if (practiced.length) await supabase.from("mnemonics").update({ last_practiced_at: new Date().toISOString() }).in("id", practiced);
  return result;
}

// ---------------------------------------------------------------------------
// The student's saved mnemonics
// ---------------------------------------------------------------------------

export type SavedMnemonic = Mnemonic & { material: { id: string; title: string } | null };

export async function listSavedMnemonics(filters: { favorites?: boolean } = {}): Promise<SavedMnemonic[]> {
  const supabase = await createClient();
  let query = supabase.from("mnemonics").select("*, material:materials!mnemonics_material_fk(id, title)").order("updated_at", { ascending: false }).limit(200);
  if (filters.favorites) query = query.eq("favorite", true);
  const { data, error } = await query;
  if (error) {
    console.error("mnemonics: list failed", error.message);
    return [];
  }
  return (data ?? []) as unknown as SavedMnemonic[];
}

/** How many mnemonics are saved, and per material how many have a list to recall (the builder offers to practice those). */
export async function getMnemonicCounts(): Promise<{ total: number; practicable: Record<string, number> }> {
  const supabase = await createClient();
  const { data } = await supabase.from("mnemonics").select("material_id, items").limit(1000);
  const practicable: Record<string, number> = {};
  for (const row of data ?? []) if (row.material_id && row.items.length >= 2) practicable[row.material_id] = (practicable[row.material_id] ?? 0) + 1;
  return { total: data?.length ?? 0, practicable };
}

export type MnemonicInput = { kind: MnemonicKind; target: string; items: string[]; content: string; explanation: string | null; materialId: string | null };

export async function createMnemonic(userId: string, input: MnemonicInput): Promise<string> {
  const supabase = await createClient();
  if (input.materialId) {
    const { data: material } = await supabase.from("materials").select("id").eq("id", input.materialId).maybeSingle();
    if (!material) throw new SessionError("Material not found.", 404);
  }
  return insertMnemonic(supabase, { userId, materialId: input.materialId, conceptId: null, kind: input.kind, target: input.target, items: input.items, content: input.content, explanation: input.explanation, source: "user" });
}

export async function updateMnemonic(id: string, input: MnemonicInput): Promise<void> {
  const supabase = await createClient();
  if (input.materialId) {
    const { data: material } = await supabase.from("materials").select("id").eq("id", input.materialId).maybeSingle();
    if (!material) throw new SessionError("Material not found.", 404);
  }
  const { data, error } = await supabase
    .from("mnemonics")
    .update({ kind: input.kind, target: input.target, items: input.items, content: input.content, explanation: input.explanation || null, material_id: input.materialId })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(`mnemonics: update failed: ${error.message}`);
  if (!data?.length) throw new SessionError("Mnemonic not found.", 404);
}

export async function setMnemonicFavorite(id: string, favorite: boolean): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("mnemonics").update({ favorite }).eq("id", id).select("id");
  if (error) throw new Error(`mnemonics: update failed: ${error.message}`);
  if (!data?.length) throw new SessionError("Mnemonic not found.", 404);
}

export async function deleteMnemonic(id: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("mnemonics").delete().eq("id", id).select("id");
  if (error) throw new Error(`mnemonics: delete failed: ${error.message}`);
  if (!data?.length) throw new SessionError("Mnemonic not found.", 404);
}

// ---------------------------------------------------------------------------
// Memory palace (method of loci)
// ---------------------------------------------------------------------------

function parseLocations(value: unknown): PalaceLocation[] {
  const parsed = z.array(palaceLocationSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** What the palace can hold: the material's defined terms first (their meaning is exact), then the other key concepts — one entry per concept, in the analysis order. */
async function palaceConcepts(supabase: Client, materialId: string): Promise<Array<{ concept: string; definition: string }>> {
  const { data } = await supabase.from("material_analyses").select("data").eq("material_id", materialId).maybeSingle();
  const analysis = data ? parseAnalysisData(data.data) : null;
  if (!analysis) return [];
  const seen = new Set<string>();
  const concepts: Array<{ concept: string; definition: string }> = [];
  for (const entry of [...analysis.definitions.map((definition) => ({ concept: definition.term, definition: definition.definition })), ...analysis.key_concepts.map((concept) => ({ concept: concept.name, definition: concept.explanation }))]) {
    const key = normalizeConceptName(entry.concept);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    concepts.push(entry);
  }
  return concepts.slice(0, 30);
}

export async function startMemoryPalace(supabase: Client, userId: string, input: FlowStartInput): Promise<FlowStartResult> {
  const context = await loadMaterialContext(supabase, input.materialId!);
  const concepts = await palaceConcepts(supabase, context.material.id);
  if (concepts.length < 3) throw new SessionError("This material needs at least three key concepts for a memory palace. Try Mnemonics or Active Recall instead.", 422);
  const state: PalaceState = { index: 0, stage: "setup", palaceId: null, palaceTitle: null, placements: [] };
  const sessionId = await openSession(supabase, userId, {
    method: "memory_palace",
    materialId: context.material.id,
    subjectId: context.material.subject_id,
    goal: input.goal ?? "memorize",
    plannedMinutes: input.plannedMinutes,
    title: sessionTitle("memory_palace", context.material.title),
    state: state as unknown as Record<string, unknown>,
  });
  return { sessionId, redirect: `/study/${sessionId}` };
}

/** The student's palaces, most recently used first. */
export async function listPalaces(): Promise<PalaceSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("memory_palaces").select("id, title, locations, last_used_at, updated_at").order("updated_at", { ascending: false }).limit(50);
  if (error) {
    console.error("memory_palaces: list failed", error.message);
    return [];
  }
  return (data ?? [])
    .map((row) => ({ id: row.id, title: row.title, locations: parseLocations(row.locations), lastUsedAt: row.last_used_at }))
    .sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""));
}

/** Creates a palace, or updates the route of an existing one. */
export async function savePalace(userId: string, input: PalaceInput & { id: string | null }): Promise<string> {
  const supabase = await createClient();
  const locations = input.locations.map((location) => ({ name: location.name, detail: location.detail || null })) as unknown as Json;
  if (input.id) {
    const { data, error } = await supabase.from("memory_palaces").update({ title: input.title, locations }).eq("id", input.id).select("id");
    if (error) throw new Error(`memory_palaces: update failed: ${error.message}`);
    if (!data?.length) throw new SessionError("Memory palace not found.", 404);
    return input.id;
  }
  const { data, error } = await supabase.from("memory_palaces").insert({ user_id: userId, title: input.title, locations }).select("id").single();
  if (error || !data) throw new Error(`memory_palaces: insert failed: ${error?.message}`);
  return data.id;
}

export async function deletePalace(id: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("memory_palaces").delete().eq("id", id).select("id");
  if (error) throw new Error(`memory_palaces: delete failed: ${error.message}`);
  if (!data?.length) throw new SessionError("Memory palace not found.", 404);
}

async function loadPalaceSession(supabase: Client, sessionId: string): Promise<{ session: StudySession; state: PalaceState }> {
  const session = await loadSession(supabase, sessionId);
  if (session.status !== "in_progress") throw new SessionError("This session is already finished.", 409);
  if (session.method !== "memory_palace") throw new SessionError("This is not a memory-palace session.", 400);
  return { session, state: palaceStateOf(session.state) };
}

function parseKey(value: string | null): LociKey | null {
  if (!value) return null;
  try {
    const key = JSON.parse(value) as Partial<LociKey>;
    return typeof key.concept === "string" ? { concept: key.concept, definition: key.definition ?? "", association: key.association ?? "" } : null;
  } catch {
    return null;
  }
}

/** The placements of the latest earlier session on the same palace and material (a palace is built once and walked often). */
async function previousPlacements(supabase: Client, session: StudySession, palaceId: string): Promise<PalacePlacement[]> {
  if (!session.material_id) return [];
  const { data: sessions } = await supabase
    .from("study_sessions")
    .select("id, state")
    .eq("method", "memory_palace")
    .eq("material_id", session.material_id)
    .neq("id", session.id)
    .contains("state", { palaceId })
    .order("started_at", { ascending: false })
    .limit(5);
  for (const previous of sessions ?? []) {
    const state = palaceStateOf(previous.state);
    if (state.placements.length) return state.placements;
    const { data: stops } = await supabase.from("study_session_items").select("analysis, model_answer, position").eq("session_id", previous.id).eq("kind", "loci");
    const placements = [...(stops ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((row) => {
        const view = lociViewOf(row.analysis);
        const key = parseKey(row.model_answer);
        return view && key ? { stop: view.stop, location: view.location, detail: view.detail, ...key } : null;
      })
      .filter((placement): placement is PalacePlacement => placement !== null);
    if (placements.length) return placements;
  }
  return [];
}

/**
 * Saves the route and places one key concept at each stop with a vivid
 * image. Stops whose location is unchanged keep the concept and image they
 * had in the last session on this palace (unless `fresh`).
 */
export async function placeConcepts(input: { sessionId: string; palace: PalaceInput & { id: string | null }; fresh: boolean }): Promise<PalaceState> {
  const supabase = await createClient();
  const { session, state } = await loadPalaceSession(supabase, input.sessionId);
  if (state.stage === "walk") throw new SessionError("The walk has already started.", 409);
  if (!session.material_id) throw new SessionError("This session's material was deleted.", 409);
  const concepts = await palaceConcepts(supabase, session.material_id);
  const count = palaceStopCount(session.planned_minutes ?? 15, input.palace.locations.length, concepts.length);
  if (count < 3) throw new SessionError("This material needs at least three key concepts for a memory palace.", 422);
  const palaceId = await savePalace(session.user_id, input.palace);
  const route = input.palace.locations.slice(0, count);

  const earlier = input.fresh ? [] : await previousPlacements(supabase, session, palaceId);
  const placements: Array<PalacePlacement | undefined> = route.map(() => undefined);
  const used = new Set<string>();
  route.forEach((location, index) => {
    const before = earlier[index];
    if (before && sameLocation(before.location, location.name) && concepts.some((concept) => normalizeConceptName(concept.concept) === normalizeConceptName(before.concept)) && !used.has(normalizeConceptName(before.concept))) {
      placements[index] = { ...before, stop: index + 1, location: location.name, detail: location.detail };
      used.add(normalizeConceptName(before.concept));
    }
  });
  const unused = concepts.filter((concept) => !used.has(normalizeConceptName(concept.concept)));
  const open = route.map((_, index) => index).filter((index) => !placements[index]);
  const pairs = open.map((index, order) => ({ index, location: route[index].name, concept: unused[order].concept, definition: unused[order].definition }));
  if (pairs.length) {
    const { data: material } = await supabase.from("materials").select("title").eq("id", session.material_id).maybeSingle();
    const { associations } = await generateAssociations({ materialTitle: material?.title ?? session.title, pairs: pairs.map(({ location, concept, definition }) => ({ location, concept, definition })) });
    pairs.forEach((pair, order) => {
      placements[pair.index] = {
        stop: pair.index + 1,
        location: pair.location,
        detail: route[pair.index].detail,
        concept: pair.concept,
        definition: pair.definition,
        association: associations.get(order) ?? `At the ${pair.location}, picture ${pair.concept}: ${pair.definition}`,
      };
    });
  }

  const next: PalaceState = { ...state, stage: "place", palaceId, palaceTitle: input.palace.title, placements: placements.filter((placement): placement is PalacePlacement => Boolean(placement)) };
  await updateSessionState(supabase, session.id, next as unknown as Record<string, unknown>);
  await supabase.from("memory_palaces").update({ last_used_at: new Date().toISOString() }).eq("id", palaceId);
  return next;
}

/** Turns the placements into walk stops; from here on the concepts stay on the server until each stop is answered. */
export async function startWalk(input: { sessionId: string }): Promise<void> {
  const supabase = await createClient();
  const { session, state } = await loadPalaceSession(supabase, input.sessionId);
  if (state.stage === "walk") return;
  if (state.stage !== "place" || state.placements.length === 0) throw new SessionError("Place the concepts first.", 409);
  // Claim the stage change first so a double click cannot create the stops twice.
  const { data: claimed, error } = await supabase
    .from("study_sessions")
    .update({ state: { ...state, stage: "walk", placements: [] } as unknown as Json, last_active_at: new Date().toISOString() })
    .eq("id", session.id)
    .eq("state->>stage", "place")
    .select("id");
  if (error) throw new Error(`study_sessions: walk failed: ${error.message}`);
  if (!claimed?.length) return;
  const concepts = await ensureConcepts(supabase, session.user_id, state.placements.map((placement) => placement.concept), { materialId: session.material_id, subjectId: session.subject_id });
  const total = state.placements.length;
  await insertItems(
    supabase,
    state.placements.map((placement, position) => {
      const view: LociView = { stop: placement.stop, total, location: placement.location, detail: placement.detail, previous: state.placements[position - 1]?.location ?? null };
      const key: LociKey = { concept: placement.concept, definition: placement.definition, association: placement.association };
      return {
        session_id: session.id,
        user_id: session.user_id,
        position,
        kind: "loci" as const,
        concept_id: concepts.get(normalizeConceptName(placement.concept)) ?? null,
        prompt: `Stop ${placement.stop}: ${placement.location}`,
        model_answer: JSON.stringify(key),
        key_points: [] as unknown as Json,
        source_excerpt: null,
        format: "walk",
        analysis: view as unknown as Json,
      };
    }),
  );
}

/** One stop of the walk: name what was placed there. */
export async function answerLoci(input: { itemId: string; answer: string; responseMs: number | null }): Promise<LociResult> {
  const supabase = await createClient();
  const { item, session } = await loadOpenItem(supabase, input.itemId);
  if (item.kind !== "loci") throw new SessionError("This item is not a memory-palace stop.", 400);
  const view = lociViewOf(item.analysis);
  const key = parseKey(item.model_answer);
  if (!view || !key) throw new SessionError("This stop is incomplete.", 422);
  const stored = lociResultOf(item.analysis);
  if (item.answered_at && stored) return stored;
  const isCorrect = itemMatches(input.answer, key.concept);
  const result: LociResult = { ...key, isCorrect, given: input.answer.trim() };
  await recordItemResult(supabase, item, session, {
    response: input.answer,
    analysis: { ...view, result } as unknown as Json,
    score: isCorrect ? 100 : 0,
    isCorrect,
    responseMs: input.responseMs,
    mistake: { question: `Memory palace: what did you place at the ${view.location}?`, correctAnswer: `${key.concept} — ${key.definition}`, explanation: `Your image: ${key.association}`, errorType: "forgotten_information" },
  });
  return result;
}
