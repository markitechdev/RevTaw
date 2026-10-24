import { describe, expect, it } from "vitest";

import { ownedObjectKey } from "@/lib/materials/purge";

const row = { id: "11111111-1111-4111-8111-111111111111", user_id: "22222222-2222-4222-8222-222222222222" };
const own = `${row.user_id}/${row.id}/Lecture 3 (biology).pdf`;

describe("ownedObjectKey", () => {
  it("keeps a key inside the material's own folder", () => {
    expect(ownedObjectKey({ ...row, storage_path: own })).toBe(own);
  });

  it("ignores a missing key", () => {
    expect(ownedObjectKey({ ...row, storage_path: null })).toBeNull();
    expect(ownedObjectKey({ ...row, storage_path: "" })).toBeNull();
  });

  it.each([
    "33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444/notes.pdf",
    `${row.user_id}/44444444-4444-4444-8444-444444444444/notes.pdf`,
    `${row.user_id}/${row.id}`,
    `${row.user_id}/${row.id}/../../33333333-3333-4333-8333-333333333333/x/notes.pdf`,
    `${row.user_id}/${row.id}/./notes.pdf`,
    `${row.user_id}/${row.id}/a\\..\\..\\notes.pdf`,
    `${row.user_id}/${row.id}/notes\u0000.pdf`,
    `/${row.user_id}/${row.id}/notes.pdf`,
  ])("refuses %j", (storage_path) => {
    expect(ownedObjectKey({ ...row, storage_path })).toBeNull();
  });
});
