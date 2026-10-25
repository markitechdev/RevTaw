import { describe, expect, it } from "vitest";

import { reminderMessage, whenLine } from "@/lib/reminders/message";

const base = { title: "Bio lab report", date: "2026-10-21", time: "14:30", minutes: 45, materialTitle: "Cell biology", notes: null, remindAt: new Date("2026-10-21T06:00:00Z"), timeZone: "Asia/Manila" };

describe("reminder messages", () => {
  it("says when the activity starts", () => {
    expect(whenLine(base)).toBe("Starts in 30 minutes");
    expect(whenLine({ ...base, remindAt: new Date("2026-10-21T06:30:00Z") })).toBe("Starts now");
    expect(whenLine({ ...base, time: null, remindAt: new Date("2026-10-20T00:00:00Z") })).toBe("Tomorrow");
  });

  it("builds the bell, the email subject and a link to the planner day", () => {
    const message = reminderMessage(base, "https://revtaw.example.com/");
    expect(message.title).toBe("Reminder: Bio lab report");
    expect(message.body).toBe("Starts in 30 minutes · 45 min · Cell biology");
    expect(message.href).toBe("/planner?date=2026-10-21");
    expect(message.subject).toBe("Reminder: Bio lab report — starts in 30 minutes");
    expect(message.text).toContain("View Planner: https://revtaw.example.com/planner?date=2026-10-21");
    expect(message.html).toContain('href="https://revtaw.example.com/planner?date=2026-10-21"');
  });

  it("is a Study Reminder for a study session, with its details", () => {
    const message = reminderMessage({ ...base, category: "study", subject: "Biology", concepts: ["Glycolysis", "ATP yield"] }, "https://revtaw.example.com", "https://revtaw.example.com/api/email/unsubscribe?u=1&k=reminders&t=x");
    expect(message.html).toContain('Your study session starts <span class="rt-accent" style="color:#1C69E3;white-space:nowrap;">in 30 minutes</span>');
    expect(message.html).toContain('src="https://revtaw.example.com/email/icon-clock.png"');
    expect(message.text).toContain("Activity: Bio lab report\nSubject: Biology\nTopic: Glycolysis, ATP yield\nDate: Wednesday, October 21\nTime: 2:30 PM\nDuration: 45 min");
    expect(message.text).toContain("Open RevTaw: https://revtaw.example.com/planner?date=2026-10-21");
    expect(message.text).toContain("Stop reminder emails: https://revtaw.example.com/api/email/unsubscribe?u=1&k=reminders&t=x");
    // A study plan's own tasks are study sessions too.
    expect(reminderMessage({ ...base, category: null, planned: true }, null).text).toContain("Your study session starts in 30 minutes");
  });

  it("is a Planner Notification for anything else", () => {
    const message = reminderMessage({ ...base, category: "assignment", time: null, remindAt: new Date("2026-10-21T00:00:00Z") }, "https://revtaw.example.com");
    expect(message.text).toContain("You have an assignment due today");
    expect(message.text).toContain("Time: Any time that day");
    expect(message.text).toContain("Topic: Cell biology");
    expect(message.html).toContain('src="https://revtaw.example.com/email/icon-checklist.png"');
  });

  it("escapes what the student typed in the email", () => {
    const message = reminderMessage({ ...base, title: '<img src=x onerror="alert(1)">', notes: "Bring <b>data</b> & charts" }, null);
    expect(message.html).not.toContain("<img");
    expect(message.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(message.html).toContain("Bring &lt;b&gt;data&lt;/b&gt; &amp; charts");
    // Without the site's address there is no button to point anywhere.
    expect(message.html).not.toContain("View Planner");
  });
});
