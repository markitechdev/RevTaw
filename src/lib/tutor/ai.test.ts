import { beforeEach, describe, expect, it, vi } from "vitest";

import { AiError } from "@/lib/ai/errors";
import type { AiGenerateOptions, AiProvider } from "@/lib/ai/types";
import { tutorReply, tutorReplySchema, type TutorTurnInput } from "@/lib/tutor/ai";

/** A provider that answers with the queued texts (or throws the queued errors), recording every call. */
const fake = vi.hoisted(() => ({ calls: [] as AiGenerateOptions[], queue: [] as Array<string | Error> }));

vi.mock("@/lib/ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ai")>()),
  getAiProvider: (): AiProvider => ({
    name: "test",
    model: "test-model",
    supportsVision: false,
    generate: async (options) => {
      fake.calls.push(options);
      const next = fake.queue.shift();
      if (next === undefined) throw new Error("no reply queued");
      if (next instanceof Error) throw next;
      return { text: next, usage: { inputTokens: 1, outputTokens: 1 }, provider: "test", model: "test-model" };
    },
  }),
}));

const input: TutorTurnInput = {
  mode: "tutor",
  materialTitle: null,
  context: [],
  truncated: false,
  history: [],
  message: "What is osmosis?",
  action: null,
  selection: null,
  student: { educationLevel: null, mainGoal: null },
};

const answer = (text: string, extra: Record<string, unknown> = {}) => JSON.stringify({ answer: text, grounding: "general", ...extra });

beforeEach(() => {
  fake.calls.length = 0;
  fake.queue.length = 0;
});

describe("tutorReply's thinking time", () => {
  it("asks for more reasoning on math, code and problems, and keeps the rest quick", async () => {
    fake.queue.push(answer("x = 4"), answer("Osmosis is…"), answer("Here is another one."));
    await tutorReply({ ...input, message: "Solve 2x + 3 = 11" });
    await tutorReply(input);
    // A quick action under a math question carries its topic.
    await tutorReply({ ...input, message: "Give me an example.", action: "example", focus: { question: "Paano i-solve ang 3x - 5 = 10?", answer: "x = 5" } });
    expect(fake.calls.map((call) => call.reasoning)).toEqual(["medium", undefined, "medium"]);
  });
});

describe("tutorReply when the AI gives nothing usable", () => {
  it("asks once more after an empty answer", async () => {
    fake.queue.push(answer(""), answer("Osmosis is water moving across a membrane."));
    const { reply } = await tutorReply(input);
    expect(reply.answer).toBe("Osmosis is water moving across a membrane.");
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1].attempt).toBe(2);
  });

  it("fails instead of saving an empty answer when the second try is empty too", async () => {
    fake.queue.push(answer("   "), answer(""));
    await expect(tutorReply(input)).rejects.toMatchObject({ name: "AiError", code: "invalid_output" });
  });

  it("fails the same way when the reply is not JSON", async () => {
    fake.queue.push("Sorry, I can't help with that.", "Still not JSON.");
    await expect(tutorReply(input)).rejects.toMatchObject({ name: "AiError", code: "invalid_output" });
  });
});

describe("tutorReply when the AI service fails", () => {
  it("passes the error on to be retried, without a second call", async () => {
    fake.queue.push(new AiError("provider_error", "HTTP 500"));
    await expect(tutorReply(input)).rejects.toMatchObject({ code: "provider_error", retryable: true });
    expect(fake.calls).toHaveLength(1);
  });

  it("keeps a rate limit's wait time", async () => {
    fake.queue.push(new AiError("rate_limited", "HTTP 429", true, { retryAfterSeconds: 30 }));
    await expect(tutorReply(input)).rejects.toMatchObject({ code: "rate_limited", retryAfterSeconds: 30 });
  });
});

describe("tutorReplySchema", () => {
  it("keeps the answer when the other fields are off", () => {
    const reply = tutorReplySchema.parse({
      answer: "  An answer.  ",
      grounding: "made_up",
      sources: [{ position: 0, quote: "a real quote" }, { position: "first" }, "junk"],
      follow_ups: ["example", "dance", "example", "why"],
      flashcard: { front: "" },
    });
    expect(reply).toMatchObject({ answer: "An answer.", grounding: "general", follow_ups: ["example", "why"], flashcard: null, additional_explanation: null });
    expect(reply.sources).toEqual([{ position: 0, heading: null, pages: null, quote: "a real quote" }]);
  });

  it("accepts small talk, which carries no lesson label", () => {
    expect(tutorReplySchema.parse({ answer: "Hi! Ready to review?", grounding: "conversation" }).grounding).toBe("conversation");
  });

  it("needs an answer", () => {
    expect(tutorReplySchema.safeParse({ answer: " \n " }).success).toBe(false);
    expect(tutorReplySchema.safeParse({ grounding: "general" }).success).toBe(false);
  });
});

describe("tutorReply's request", () => {
  it("asks for JSON with the student's message in the last turn", async () => {
    fake.queue.push(answer("Osmosis is…"));
    await tutorReply(input);
    const [call] = fake.calls;
    expect(call).toMatchObject({ task: "tutor_reply", json: true, temperature: 0.3, maxTokens: 1_500 });
    expect(call.system).toContain("You are Tamari");
    expect(call.messages.at(-1)?.content).toContain("<student_message>\nWhat is osmosis?\n</student_message>");
  });

  it("gives a whole lesson more room, and Answer again more variety", async () => {
    fake.queue.push(answer("A lesson."), answer("Another angle."));
    await tutorReply({ ...input, message: "Teach me the whole lesson on cells" });
    await tutorReply({ ...input, previousAttempt: "Osmosis is…" });
    expect(fake.calls[0].maxTokens).toBe(2_400);
    expect(fake.calls[1].temperature).toBe(0.6);
  });
});
