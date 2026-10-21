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
    expect(message.text).toContain("Open your planner: https://revtaw.example.com/planner?date=2026-10-21");
    expect(message.html).toContain('href="https://revtaw.example.com/planner?date=2026-10-21"');
  });

  it("escapes what the student typed in the email", () => {
    const message = reminderMessage({ ...base, title: '<img src=x onerror="alert(1)">', notes: "Bring <b>data</b> & charts" }, null);
    expect(message.html).not.toContain("<img");
    expect(message.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(message.html).toContain("Bring &lt;b&gt;data&lt;/b&gt; &amp; charts");
    expect(message.html).not.toContain("Open my planner");
  });
});
