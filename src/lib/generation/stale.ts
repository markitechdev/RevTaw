import type { GenerationStatus, MaterialStatus } from "@/lib/supabase/database.types";

/**
 * Work that runs inside a request (processing a material, writing a quiz,
 * deck or reviewer) stops when its route does — after 120 seconds at most.
 * Anything still "in progress" well past that was cut off (a timeout, a
 * closed tab, a canceled upload) and is shown as failed, with Try again.
 */
export const STALE_AFTER_MS = 5 * 60_000;

export const STOPPED_DETAIL = "This stopped before it finished. Try again.";
export const UPLOAD_STOPPED_DETAIL = "This upload didn't finish. Try again, or upload the file again if it keeps happening.";

export const MATERIAL_IN_FLIGHT: ReadonlySet<MaterialStatus> = new Set(["uploading", "extracting", "analyzing"]);

/** Whether a step that started at `since` should have ended by `now`. */
export function isStale(since: string | null | undefined, now: number = Date.now()): boolean {
  if (!since) return true;
  const started = new Date(since).getTime();
  return Number.isNaN(started) || now - started > STALE_AFTER_MS;
}

type MaterialStatusRow = {
  status: MaterialStatus;
  status_detail: string | null;
  created_at: string;
  updated_at: string;
  last_processed_at?: string | null;
};

/** When the material's current step began: the upload at insert, processing at its last start. */
function materialStepStart(row: MaterialStatusRow): string {
  return row.status === "uploading" ? row.created_at : (row.last_processed_at ?? row.updated_at);
}

/** Whether a material's in-progress step has been cut off. */
export function isStaleMaterial(row: MaterialStatusRow, now: number = Date.now()): boolean {
  return MATERIAL_IN_FLIGHT.has(row.status) && isStale(materialStepStart(row), now);
}

/** The material as students should see it: a cut-off step reads as failed. */
export function settleMaterialStatus<Row extends MaterialStatusRow>(row: Row, now: number = Date.now()): Row {
  if (!isStaleMaterial(row, now)) return row;
  return { ...row, status: "failed", status_detail: row.status === "uploading" ? UPLOAD_STOPPED_DETAIL : STOPPED_DETAIL };
}

type GenerationRow = { status: GenerationStatus; status_detail: string | null; updated_at: string };

/** Whether a quiz, deck or reviewer has been "generating" for longer than any request can run. */
export function isStaleGeneration(row: GenerationRow, now: number = Date.now()): boolean {
  return row.status === "generating" && isStale(row.updated_at, now);
}

/** The quiz, deck or reviewer as students should see it: a cut-off generation reads as failed. */
export function settleGenerationStatus<Row extends GenerationRow>(row: Row, now: number = Date.now()): Row {
  if (!isStaleGeneration(row, now)) return row;
  return { ...row, status: "failed", status_detail: STOPPED_DETAIL };
}
