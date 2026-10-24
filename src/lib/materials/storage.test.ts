import { describe, expect, it, vi } from "vitest";

import { listUserObjectPaths, removeMaterialObjects } from "@/lib/materials/storage";

type Entry = { name: string; id: string | null };

/** A storage client over a fixed tree, listing one folder level at a time like Supabase Storage. */
function fakeStorage(tree: Record<string, Entry[]>) {
  const lists: Array<{ folder: string; offset: number }> = [];
  const removed: string[][] = [];
  const bucket = {
    list: vi.fn(async (folder: string, options: { limit: number; offset: number }) => {
      lists.push({ folder, offset: options.offset });
      return { data: (tree[folder] ?? []).slice(options.offset, options.offset + options.limit), error: null };
    }),
    remove: vi.fn(async (paths: string[]) => {
      removed.push(paths);
      return { data: [], error: null };
    }),
  };
  return { client: { storage: { from: () => bucket } } as never, lists, removed };
}

describe("listUserObjectPaths", () => {
  it("walks the student's folders and every page of each", async () => {
    const bulk = Array.from({ length: 1005 }, (_, index) => ({ name: `f${index}.txt`, id: `id-${index}` }));
    const { client, lists } = fakeStorage({
      u1: [
        { name: "m1", id: null },
        { name: "bulk", id: null },
        { name: "loose.txt", id: "x" },
      ],
      "u1/m1": [{ name: "lecture.pdf", id: "a" }],
      "u1/bulk": bulk,
    });
    const paths = await listUserObjectPaths(client, "u1");
    expect(paths).toHaveLength(1007);
    expect(paths).toContain("u1/loose.txt");
    expect(paths).toContain("u1/m1/lecture.pdf");
    expect(paths).toContain("u1/bulk/f1004.txt");
    expect(lists.filter((call) => call.folder === "u1/bulk").map((call) => call.offset)).toEqual([0, 1000]);
    expect(lists.every((call) => call.folder === "u1" || call.folder.startsWith("u1/"))).toBe(true);
  });

  it("stops at an error instead of reporting a partial folder", async () => {
    const client = { storage: { from: () => ({ list: async () => ({ data: null, error: { message: "boom" } }) }) } } as never;
    await expect(listUserObjectPaths(client, "u1")).rejects.toThrow(/storage list failed: boom/);
  });
});

describe("removeMaterialObjects", () => {
  it("removes in batches of 500 and skips duplicates", async () => {
    const { client, removed } = fakeStorage({});
    const paths = Array.from({ length: 1001 }, (_, index) => `u1/m/${index}`);
    await removeMaterialObjects(client, [...paths, "u1/m/0", ""]);
    expect(removed.map((batch) => batch.length)).toEqual([500, 500, 1]);
  });
});
