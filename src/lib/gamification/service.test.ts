import { describe, expect, it, vi } from "vitest";

import { awardXp } from "@/lib/gamification/service";

vi.mock("@/lib/notifications/allowed", () => ({ inAppAllowed: async () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => null }));

/** A client where the profile reads `xpBefore` when the award starts and `xpAfter` once it is in. */
function fakeClient(xpBefore: number, xpAfter: number, inserted: number[]) {
  const notifications: Array<{ dedupe_key: string }> = [];
  const client = {
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            maybeSingle: async () => ({ data: { id: "u1", xp: xpBefore }, error: null }),
            eq: () => ({ maybeSingle: async () => ({ data: { xp: xpAfter }, error: null }) }),
          }),
        };
      }
      if (table === "xp_events") return { upsert: () => ({ select: async () => ({ data: inserted.map((points) => ({ points })), error: null }) }) };
      if (table === "notifications") {
        return {
          upsert: async (row: { dedupe_key: string }) => {
            notifications.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client: client as never, notifications };
}

const award = (points: number) => [{ source: "answers" as const, sourceKey: `attempt:${points}`, points }];

describe("awardXp level-ups", () => {
  it("announces a level that two awards at the same moment reach together", async () => {
    // Both awards read 90 XP; the other one's 8 XP is already in when this one's 5 XP lands (100 XP is level 2).
    const { client, notifications } = fakeClient(90, 103, [5]);
    expect(await awardXp(award(5), client)).toBe(5);
    expect(notifications.map((row) => row.dedupe_key)).toEqual(["level:2"]);
  });

  it("announces nothing while the total stays under the line", async () => {
    const { client, notifications } = fakeClient(90, 95, [5]);
    await awardXp(award(5), client);
    expect(notifications).toEqual([]);
  });

  it("announces nothing when the award was already given", async () => {
    const { client, notifications } = fakeClient(90, 90, []);
    expect(await awardXp(award(15), client)).toBe(0);
    expect(notifications).toEqual([]);
  });

  it("announces once the award itself crosses the line", async () => {
    const { client, notifications } = fakeClient(290, 305, [15]);
    await awardXp(award(15), client);
    expect(notifications.map((row) => row.dedupe_key)).toEqual(["level:3"]);
  });
});
