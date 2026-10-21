import { z } from "zod";

/**
 * What the student is looking at, as the page tells Ask RevTaw (UI phase §17).
 * Only ids cross from the browser; the server loads the details itself with
 * the student's own session, so row-level security decides what it can read.
 * Client-safe.
 */
export const pageContextSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("material"), id: z.uuid() }),
  z.object({ kind: z.literal("reviewer"), id: z.uuid() }),
  z.object({ kind: z.literal("attempt"), id: z.uuid() }),
  z.object({ kind: z.literal("deck"), id: z.uuid() }),
  z.object({ kind: z.literal("exam"), id: z.uuid() }),
  z.object({ kind: z.literal("session"), id: z.uuid() }),
  z.object({ kind: z.literal("progress") }),
]);

export type PageContextRef = z.infer<typeof pageContextSchema>;
