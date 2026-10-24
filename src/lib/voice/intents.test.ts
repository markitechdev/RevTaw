import { describe, expect, it } from "vitest";

import { confirmationAnswer, normalizeSpeech, routeVoiceCommand } from "@/lib/voice/intents";

describe("normalizeSpeech", () => {
  it("drops punctuation, accents, wake words and please", () => {
    expect(normalizeSpeech("Hey RevTaw, please open the Planner!")).toBe("open the planner");
    expect(normalizeSpeech("Pakí buksan ang planner")).toBe("buksan ang planner");
    expect(normalizeSpeech("Let's start")).toBe("lets start");
  });
});

describe("routeVoiceCommand", () => {
  it("opens pages in English, Filipino and Taglish", () => {
    expect(routeVoiceCommand("Open the planner")).toEqual({ kind: "navigate", href: "/planner", label: "Planner" });
    expect(routeVoiceCommand("Go to my flashcards")).toMatchObject({ href: "/flashcards" });
    expect(routeVoiceCommand("Buksan mo ang planner")).toMatchObject({ href: "/planner" });
    expect(routeVoiceCommand("Pumunta sa materials")).toMatchObject({ href: "/materials" });
    expect(routeVoiceCommand("show my progress")).toMatchObject({ href: "/progress" });
    expect(routeVoiceCommand("open study methods")).toMatchObject({ href: "/methods" });
    expect(routeVoiceCommand("take me to the mistake notebook")).toMatchObject({ href: "/quiz/mistakes" });
  });

  it("opens the create dialogs instead of creating anything", () => {
    expect(routeVoiceCommand("Create a quiz")).toMatchObject({ kind: "navigate", href: "/quiz?create=1" });
    expect(routeVoiceCommand("gumawa ng quiz")).toMatchObject({ href: "/quiz?create=1" });
    expect(routeVoiceCommand("make flashcards")).toMatchObject({ href: "/flashcards?create=1" });
    expect(routeVoiceCommand("add an exam")).toMatchObject({ href: "/planner?exam=new" });
    expect(routeVoiceCommand("upload a file")).toMatchObject({ href: "/materials?upload=1" });
  });

  it("starts study tools", () => {
    expect(routeVoiceCommand("start a pomodoro")).toMatchObject({ href: "/study?method=pomodoro" });
    expect(routeVoiceCommand("start smart study")).toMatchObject({ href: "/study?method=smart_study" });
    expect(routeVoiceCommand("simulan ang flashcards")).toMatchObject({ href: "/flashcards/review" });
    expect(routeVoiceCommand("let's start")).toMatchObject({ href: "/study" });
  });

  it("asks for confirmation-worthy saves by intent, not by navigation", () => {
    expect(routeVoiceCommand("Save that to my notes")).toEqual({ kind: "save_note" });
    expect(routeVoiceCommand("add to notes")).toEqual({ kind: "save_note" });
    expect(routeVoiceCommand("isave mo yan")).toEqual({ kind: "save_note" });
    expect(routeVoiceCommand("make a flashcard from that")).toEqual({ kind: "save_flashcard" });
    expect(routeVoiceCommand("turn that into a flashcard")).toEqual({ kind: "save_flashcard" });
    expect(routeVoiceCommand("gawing flashcard yan")).toEqual({ kind: "save_flashcard" });
  });

  it("understands stop, new chat and theme", () => {
    expect(routeVoiceCommand("stop")).toEqual({ kind: "stop" });
    expect(routeVoiceCommand("tama na")).toEqual({ kind: "stop" });
    expect(routeVoiceCommand("new chat")).toEqual({ kind: "new_chat" });
    expect(routeVoiceCommand("dark mode")).toEqual({ kind: "theme", theme: "dark" });
    expect(routeVoiceCommand("switch to light")).toEqual({ kind: "theme", theme: "light" });
  });

  it("keeps questions as questions", () => {
    expect(routeVoiceCommand("What is photosynthesis?")).toEqual({ kind: "ask", text: "What is photosynthesis?" });
    expect(routeVoiceCommand("Show me how the Calvin cycle works")).toMatchObject({ kind: "ask" });
    expect(routeVoiceCommand("Light")).toMatchObject({ kind: "ask" });
    expect(routeVoiceCommand("Bakit mahalaga ang chlorophyll?")).toMatchObject({ kind: "ask" });
    expect(routeVoiceCommand("open the textbook to chapter three and explain osmosis to me")).toMatchObject({ kind: "ask" });
    expect(routeVoiceCommand("make a summary of the lesson about cells and mitosis please")).toMatchObject({ kind: "ask" });
  });
});

describe("talking to Tamari", () => {
  it("takes \"Tamari\" (or \"Hey Tamari\") in front of commands and questions", () => {
    expect(normalizeSpeech("Tamari, open the planner")).toBe("open the planner");
    expect(routeVoiceCommand("Tamari, open the planner")).toMatchObject({ kind: "navigate", href: "/planner" });
    expect(routeVoiceCommand("Hey Tamari, start a 25-minute Pomodoro")).toMatchObject({ kind: "navigate", href: "/study?method=pomodoro" });
    expect(routeVoiceCommand("Tamari, explain recursion.")).toEqual({ kind: "ask", text: "explain recursion." });
    expect(routeVoiceCommand("Tamari, explain mo sakin yung recursion")).toEqual({ kind: "ask", text: "explain mo sakin yung recursion" });
    expect(routeVoiceCommand("Tamari")).toEqual({ kind: "ask", text: "" });
  });

  it("reviews mistakes and flashcards", () => {
    expect(routeVoiceCommand("Tamari, review my mistakes")).toMatchObject({ kind: "navigate", href: "/study?method=error_review" });
    expect(routeVoiceCommand("review my flashcards")).toMatchObject({ href: "/flashcards/review" });
    expect(routeVoiceCommand("review the Calvin cycle")).toMatchObject({ kind: "ask" });
  });

  it("finds an item by name, and keeps plain lists as lists", () => {
    expect(routeVoiceCommand("Tamari, open my Calculus reviewer")).toEqual({ kind: "find", query: "calculus", type: "note", href: "/notes", label: "Reviewers" });
    expect(routeVoiceCommand("buksan ang biology quiz")).toMatchObject({ kind: "find", query: "biology", type: "quiz" });
    expect(routeVoiceCommand("open the reviewer about binary trees")).toMatchObject({ kind: "find", query: "binary trees", type: "note" });
    expect(routeVoiceCommand("open my notes")).toEqual({ kind: "navigate", href: "/notes", label: "Reviewers" });
    expect(routeVoiceCommand("open study methods")).toMatchObject({ kind: "navigate", href: "/methods" });
  });

  it("leaves questions about study data to Tamari", () => {
    expect(routeVoiceCommand("Tamari, what topics am I weak at?")).toEqual({ kind: "ask", text: "what topics am I weak at?" });
    expect(routeVoiceCommand("Tamari, what should I study today?")).toMatchObject({ kind: "ask" });
    expect(routeVoiceCommand("Tamari, quiz me about chapter 3")).toMatchObject({ kind: "ask" });
  });
});

describe("confirmationAnswer", () => {
  it("reads yes and no in English and Filipino", () => {
    expect(confirmationAnswer("Yes please")).toBe("yes");
    expect(confirmationAnswer("Sige")).toBe("yes");
    expect(confirmationAnswer("Opo")).toBe("yes");
    expect(confirmationAnswer("No")).toBe("no");
    expect(confirmationAnswer("Huwag")).toBe("no");
    expect(confirmationAnswer("hindi po")).toBe("no");
    expect(confirmationAnswer("what do you mean")).toBeNull();
  });
});
