import { describe, expect, it } from "vitest";

import {
  confirmSignupEmail,
  daysFromNow,
  emailChangeEmail,
  examEmail,
  greetingFor,
  isStudyActivity,
  longDate,
  notificationEmail,
  passwordChangedEmail,
  plannerNotificationEmail,
  resetPasswordEmail,
  reviewReminderEmail,
  studyReminderEmail,
  todaysPlanEmail,
  welcomeEmail,
  type ReminderActivity,
} from "@/lib/email/templates";

const activity: ReminderActivity = { title: "Biology reviewer", category: "study", planned: false, subject: "Biology", topic: "Cell respiration", date: "2026-10-27", time: "2:30 PM", minutes: 45, notes: null };
const reminder = (overrides: Partial<ReminderActivity>, phrase: string) => ({ activity: { ...activity, ...overrides }, timing: { phrase }, subject: "s", preheader: "p", link: "https://r.example/planner" });
const daily = { subject: "s", preheader: "p", greeting: "Good morning, Ana!", link: "https://r.example/x", sections: [] };

describe("email helpers", () => {
  it("greets by first name", () => {
    expect(greetingFor("Ana Cruz")).toBe("Hi Ana,");
    expect(greetingFor("  ")).toBe("Hi there,");
    expect(greetingFor(null)).toBe("Hi there,");
  });

  it("writes dates and countdowns in words", () => {
    expect(longDate("2026-10-27")).toBe("Tuesday, October 27");
    expect([daysFromNow(0), daysFromNow(1), daysFromNow(3)]).toEqual(["today", "tomorrow", "in 3 days"]);
  });

  it("tells study sessions from other activities", () => {
    expect(isStudyActivity({ category: "study", planned: false })).toBe(true);
    expect(isStudyActivity({ category: "review", planned: false })).toBe(true);
    expect(isStudyActivity({ category: null, planned: true })).toBe(true);
    expect(isStudyActivity({ category: null, planned: false })).toBe(false);
    expect(isStudyActivity({ category: "assignment", planned: true })).toBe(false);
  });
});

describe("account emails", () => {
  it("reset password: lock, the button, when the link expires and the security note", () => {
    const email = resetPasswordEmail({ link: "L", expiry: "1 hour" });
    expect(email).toMatchObject({ icon: "lock", title: "Reset your password", titleAccent: "password", button: { label: "Reset Password", href: "L" }, buttonNote: "This link will expire in 1 hour for your security.", showLink: true });
    expect(email.notice?.title).toBe("Didn't request this?");
  });

  it("password changed: what happened, then a way to secure the account", () => {
    const email = passwordChangedEmail({ email: "ana@example.com", secureLink: "S" });
    expect(email).toMatchObject({ icon: "shield", title: "Your password was changed", button: { label: "Secure My Account", href: "S" } });
    expect(email.paragraphs[0]).toContain("ana@example.com");
    expect(email.notice).toMatchObject({ title: "Didn't make this change?", placement: "before-button" });
  });

  it("account confirmation and email change", () => {
    expect(confirmSignupEmail({ link: "C", expiry: "1 hour" })).toMatchObject({ icon: "check", title: "Confirm your RevTaw account", button: { label: "Confirm Email" } });
    const change = emailChangeEmail({ link: "E", currentEmail: "old@example.com", newEmail: "new@example.com", expiry: "1 hour" });
    expect(change).toMatchObject({ icon: "mail", title: "Confirm your new email", button: { label: "Confirm New Email", href: "E" } });
    expect(change.paragraphs[0]).toContain("from old@example.com to new@example.com");
  });
});

describe("planner reminders", () => {
  it("a study session that starts soon", () => {
    const email = studyReminderEmail(reminder({}, "in 30 minutes"));
    expect(email).toMatchObject({ icon: "clock", title: "Your study session starts in 30 minutes", titleAccent: "in 30 minutes", button: { label: "Open RevTaw" } });
    expect(email.details?.map((detail) => detail.label)).toEqual(["Activity", "Subject", "Topic", "Date", "Time", "Duration"]);
    expect(studyReminderEmail(reminder({}, "now")).title).toBe("Your study session starts now");
    expect(studyReminderEmail(reminder({}, "tomorrow at 2:30 PM")).title).toBe("You have a study session coming up");
    expect(studyReminderEmail(reminder({ time: null }, "today"))).toMatchObject({ icon: "calendar", title: "You have a study session planned today" });
  });

  it("a task due that day, a class and an exam", () => {
    expect(plannerNotificationEmail(reminder({ category: "assignment", time: null }, "today"))).toMatchObject({ icon: "checklist", title: "You have an assignment due today", titleAccent: "due today", button: { label: "View Planner" } });
    expect(plannerNotificationEmail(reminder({ category: "other", time: null }, "tomorrow")).title).toBe("You have a task due tomorrow");
    expect(plannerNotificationEmail(reminder({ category: "class" }, "in 10 minutes"))).toMatchObject({ icon: "calendar", title: "Your class starts in 10 minutes" });
    expect(plannerNotificationEmail(reminder({ category: "exam", time: null }, "on Tue, Oct 27"))).toMatchObject({ icon: "calendar-clock", title: "You have an exam on Tue, Oct 27" });
  });

  it("leaves the button out without a link", () => {
    expect(studyReminderEmail({ ...reminder({}, "now"), link: null }).button).toBeNull();
  });
});

describe("the daily email's leads", () => {
  it("reviews due", () => {
    expect(reviewReminderEmail({ ...daily, dueReviews: 12 })).toMatchObject({ icon: "refresh", title: "You have 12 reviews due today", titleAccent: "12 reviews", button: { label: "Start Reviewing" } });
    expect(reviewReminderEmail({ ...daily, dueReviews: 1 }).title).toBe("You have 1 review due today");
  });

  it("an exam with its details", () => {
    const email = examEmail({ ...daily, exam: { title: "Calculus exam", daysLeft: 3, date: "2026-10-28", subject: "Calculus", progress: "4 of 10 planned activities done", weakTopics: ["Chain rule", "Limits"] } });
    expect(email).toMatchObject({ icon: "calendar-clock", title: "Your Calculus exam is in 3 days", titleAccent: "in 3 days", button: { label: "Start Smart Study" } });
    expect(email.details).toEqual([
      { label: "Exam date", value: "Wednesday, October 28" },
      { label: "Subject", value: "Calculus" },
      { label: "Study progress", value: "4 of 10 planned activities done" },
      { label: "Weak topics", value: "Chain rule, Limits" },
    ]);
    expect(examEmail({ ...daily, exam: { title: "Bio quiz", daysLeft: 0, date: "2026-10-28", subject: null, progress: null, weakTopics: [] } })).toMatchObject({ title: "Your Bio quiz is today", details: [{ label: "Exam date", value: "Wednesday, October 28" }] });
  });

  it("today's plan", () => {
    const email = todaysPlanEmail({ ...daily, tasks: [{ title: "Read chapter 3", time: null, minutes: 20 }] });
    expect(email).toMatchObject({ icon: "checklist", title: "You have 1 activity planned today", button: { label: "View Planner" } });
    expect(email.details).toEqual([{ label: "Any time", value: "Read chapter 3 · 20 min" }]);
  });
});

describe("welcome and general notifications", () => {
  it("welcome", () => {
    expect(welcomeEmail({ name: "Ana Cruz", link: "D" })).toMatchObject({ icon: "sparkles", greeting: "Hi Ana,", title: "Welcome to RevTaw", button: { label: "Start Studying", href: "D" } });
  });

  it("a general notification with defaults", () => {
    expect(notificationEmail({ subject: "Ready", title: "Your reviewer is ready", body: "It has 12 sections." })).toMatchObject({ icon: "bell", preheader: "It has 12 sections.", paragraphs: ["It has 12 sections."], button: null, notice: null });
  });
});
