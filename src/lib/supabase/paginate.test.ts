import { redirect } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readPagesQuietly } from "@/lib/supabase/paginate";

describe("readPagesQuietly", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads every page up to the cap", async () => {
    const table = Array.from({ length: 1200 }, (_, index) => index);
    const build = async (from: number, to: number) => ({ data: table.slice(from, to + 1), error: null });
    expect(await readPagesQuietly("test", build, 2000)).toHaveLength(1200);
    expect(await readPagesQuietly("test", build, 1000)).toHaveLength(1000);
  });

  it("logs a failed read and gives no rows, even after a good first page", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const build = async (from: number, to: number) => (from === 0 ? { data: Array.from({ length: to - from + 1 }, (_, index) => index), error: null } : { data: null, error: { message: "timeout" } });
    expect(await readPagesQuietly("activity: reviews", build, 2000)).toEqual([]);
    expect(log).toHaveBeenCalledWith("activity: reviews: read failed", "timeout");
  });

  it("lets Next.js's own signals through", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(readPagesQuietly("test", async () => redirect("/login"), 10)).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });
  });
});
