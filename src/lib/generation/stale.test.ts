import { describe, expect, it } from "vitest";

import {
  isStale,
  isStaleGeneration,
  settleGenerationStatus,
  settleMaterialStatus,
  STALE_AFTER_MS,
  STOPPED_DETAIL,
  UPLOAD_STOPPED_DETAIL,
} from "@/lib/generation/stale";

const now = Date.parse("2026-10-24T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("isStale", () => {
  it("is false within the limit and true after it", () => {
    expect(isStale(ago(STALE_AFTER_MS - 1000), now)).toBe(false);
    expect(isStale(ago(STALE_AFTER_MS + 1000), now)).toBe(true);
  });

  it("treats a missing or unreadable time as stale", () => {
    expect(isStale(null, now)).toBe(true);
    expect(isStale("not a date", now)).toBe(true);
  });
});

describe("settleMaterialStatus", () => {
  const base = { status_detail: null, updated_at: ago(1000), last_processed_at: null as string | null };

  it("fails an upload that never finished, timed from the row's creation", () => {
    const row = settleMaterialStatus({ ...base, status: "uploading", created_at: ago(STALE_AFTER_MS + 60_000) }, now);
    expect(row.status).toBe("failed");
    expect(row.status_detail).toBe(UPLOAD_STOPPED_DETAIL);
  });

  it("times processing from its last start, not from unrelated row updates", () => {
    const row = settleMaterialStatus({ ...base, status: "analyzing", created_at: ago(3_600_000), last_processed_at: ago(STALE_AFTER_MS + 1000) }, now);
    expect(row.status).toBe("failed");
    expect(row.status_detail).toBe(STOPPED_DETAIL);
  });

  it("leaves work that may still be running alone", () => {
    const row = { ...base, status: "extracting" as const, created_at: ago(3_600_000), last_processed_at: ago(30_000) };
    expect(settleMaterialStatus(row, now)).toBe(row);
  });

  it("leaves settled statuses alone", () => {
    for (const status of ["ready", "failed", "deleted"] as const) {
      const row = { ...base, status, created_at: ago(3_600_000) };
      expect(settleMaterialStatus(row, now)).toBe(row);
    }
  });
});

describe("settleGenerationStatus", () => {
  it("fails a quiz, deck or reviewer generating past the limit", () => {
    const row = { id: "q", status: "generating" as const, status_detail: null, updated_at: ago(STALE_AFTER_MS + 1) };
    expect(isStaleGeneration(row, now)).toBe(true);
    expect(settleGenerationStatus(row, now)).toMatchObject({ id: "q", status: "failed", status_detail: STOPPED_DETAIL });
  });

  it("keeps a recent generation and finished ones as they are", () => {
    const recent = { status: "generating" as const, status_detail: null, updated_at: ago(60_000) };
    expect(settleGenerationStatus(recent, now)).toBe(recent);
    const ready = { status: "ready" as const, status_detail: null, updated_at: ago(STALE_AFTER_MS * 10) };
    expect(settleGenerationStatus(ready, now)).toBe(ready);
  });
});
