import { describe, expect, it } from "vitest";

import { digestIsEmpty, digestMessage, type DigestContent } from "@/lib/notifications/digest";

const content: DigestContent = {
  day: "2026-10-22",
  dueReviews: 12,
  tasks: [
    { title: "Biology <reviewer>", time: "14:30:00", minutes: 25 },
    { title: "Read chapter 3", time: null, minutes: 20 },
  ],
  exams: [{ title: "Bio midterm", date: "2026-10-25", daysLeft: 3 }],
};

describe("daily digest", () => {
  it("summarizes the day in the subject and escapes the student's text", () => {
    const message = digestMessage("Ana Reyes", content, "https://revtaw.example/", "https://revtaw.example/api/email/unsubscribe?u=1&k=digest&t=x");
    expect(message.subject).toBe("Today in RevTaw: 12 cards to review · 2 planned activities · Bio midterm in 3 days");
    expect(message.html).toContain("Good morning, Ana!");
    expect(message.html).toContain("2:30 PM · Biology &lt;reviewer&gt; (25 min)");
    expect(message.html).not.toContain("<reviewer>");
    expect(message.html).toContain('href="https://revtaw.example/planner?date=2026-10-22"');
    expect(message.html).toContain("Stop the daily digest");
    expect(message.text).toContain("- 2:30 PM · Biology <reviewer> (25 min)");
    expect(message.text).toContain("Bio midterm: in 3 days");
    expect(message.text).toContain("Stop the daily digest: https://revtaw.example/api/email/unsubscribe?u=1&k=digest&t=x");
  });

  it("is skipped on a day with nothing to study", () => {
    expect(digestIsEmpty({ day: "2026-10-22", dueReviews: 0, tasks: [], exams: [] })).toBe(true);
    expect(digestIsEmpty(content)).toBe(false);
  });

  it("says today and tomorrow for close exams", () => {
    const message = digestMessage(null, { day: "2026-10-22", dueReviews: 0, tasks: [], exams: [{ title: "Quiz", date: "2026-10-22", daysLeft: 0 }, { title: "Exam", date: "2026-10-23", daysLeft: 1 }] }, "https://r.example", null);
    expect(message.subject).toBe("Today in RevTaw: Quiz today");
    expect(message.text).toContain("Good morning!");
    expect(message.text).toContain("- Exam: tomorrow");
    expect(message.text).not.toContain("Stop the daily digest");
  });

  it("goes out without links when the site has no public address", () => {
    const message = digestMessage("Ana", content, null, null);
    expect(message.html).not.toMatch(/href=|localhost/);
    expect(message.text).not.toMatch(/https?:|localhost|Open RevTaw/);
    expect(message.text).toContain("Flashcards: 12 cards are due today.");
    expect(message.text).toContain("- Read chapter 3 (20 min)");
  });
});
