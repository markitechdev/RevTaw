import "server-only";

import { normalizeConceptName } from "@/lib/concepts/service";
import { loadMaterialContext } from "@/lib/reviewers/service";
import { conceptsFor, insertItems, loadOpenItem, openSession, recordItemResult, type Client, type FlowStartInput, type FlowStartResult, type ItemRow } from "@/lib/study/items";
import {
  deviceMatchesItems,
  gradeListRecall,
  listScore,
  mnemonicCount,
  mnemonicViewOf,
  MNEMONIC_KIND_LABEL,
  targetIsOrdered,
  type MnemonicItemView,
  type MnemonicOption,
  type MnemonicPracticeResult,
} from "@/lib/study/memory-options";
import { generateMnemonics } from "@/lib/study/prompts/memory";
import { SessionError, sessionTitle } from "@/lib/study/sessions";
import type { Json, Mnemonic, MnemonicKind } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Memory techniques (§16). Mnemonics: RevTaw finds the lists in a material
 * that are hard to memorize and offers accurate devices for each; the student
 * picks one (or writes their own), saves the ones that work and recalls the
 * list from the device alone. Saved mnemonics live in `mnemonics` and come
 * back for practice.
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
