import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { STALE_AFTER_MS } from "@/lib/generation/stale";
import type { Database, GenerationStatus } from "@/lib/supabase/database.types";

type Client = SupabaseClient<Database>;
type GeneratedTable = "quizzes" | "flashcard_decks" | "reviewers";

/**
 * Takes a quiz, deck or reviewer for "Try again": only a failed one, or one
 * still "generating" long after any request could be working on it. The
 * status check is part of each update, so only one request can win, and a
 * stale "Try again" tab never wipes one that has finished since.
 */
export async function claimForRetry(supabase: Client, table: GeneratedTable, id: string, now: number = Date.now()): Promise<boolean> {
  const fields = { status: "generating" as const, status_detail: null };
  const failed = await supabase.from(table).update(fields).eq("id", id).eq("status", "failed").select("id");
  if (failed.error) throw new Error(`${table}: retry claim failed: ${failed.error.message}`);
  if (failed.data?.length) return true;
  const cutOff = await supabase
    .from(table)
    .update(fields)
    .eq("id", id)
    .eq("status", "generating")
    .lt("updated_at", new Date(now - STALE_AFTER_MS).toISOString())
    .select("id");
  if (cutOff.error) throw new Error(`${table}: retry claim failed: ${cutOff.error.message}`);
  return Boolean(cutOff.data?.length);
}

/** The answer (with 409) when there was nothing to take. */
export function retryRefusal(status: GenerationStatus, noun: string): string {
  return status === "generating"
    ? `This ${noun} is still being generated. Give it a minute.`
    : `This ${noun} is already ready. Reload the page to open it.`;
}
