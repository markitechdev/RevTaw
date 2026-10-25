import { BRAND } from "@/lib/brand";
import type { EmailContent, EmailDetail, EmailIcon, EmailLink, EmailNotice, EmailSection } from "@/lib/email/render";

/**
 * Every RevTaw email, as content for the one shared design (render.ts): the icon, title, words, button and
 * notice of each type. Pure; the callers bring the data and the links, and the renderer escapes all of it.
 *
 *   1 resetPasswordEmail       lock        Reset Password        (Supabase template)
 *   2 passwordChangedEmail     shield      Secure My Account     (Supabase notification)
 *   3 confirmSignupEmail       check       Confirm Email         (Supabase template)
 *   4 emailChangeEmail         mail        Confirm New Email     (Supabase template)
 *   5 studyReminderEmail       clock       Open RevTaw           (a planner study activity's reminder)
 *   6 plannerNotificationEmail checklist…  View Planner          (any other planner activity's reminder)
 *   7 reviewReminderEmail      refresh     Start Reviewing       (the daily email, when cards are due)
 *   8 examEmail                calendar…   Start Smart Study     (the daily email, when an exam is close)
 *   9 welcomeEmail             sparkles    Start Studying        (once, after onboarding)
 *  10 notificationEmail        any         optional              (anything new)
 *
 * The daily email also uses todaysPlanEmail (checklist, View Planner) on a day with only planned activities.
 */

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "Hi Ana," from a display name (first name only), else "Hi there,". */
export function greetingFor(name: string | null | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Hi ${first.slice(0, 40)},` : "Hi there,";
}

/** "Tuesday, October 21" for a calendar date (YYYY-MM-DD). */
export function longDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
}

/** "today", "tomorrow", "in 3 days". */
export function daysFromNow(daysLeft: number): string {
  if (daysLeft <= 0) return "today";
  if (daysLeft === 1) return "tomorrow";
  return `in ${daysLeft} days`;
}

type Footer = { reason?: string | null; unsubscribe?: EmailLink | null };

// ---------------------------------------------------------------------------
// Account emails (sent by Supabase Auth from the templates in supabase/templates)
// ---------------------------------------------------------------------------

export function resetPasswordEmail(input: { link: string; expiry: string }): EmailContent {
  return {
    subject: "Reset your RevTaw password",
    preheader: "Choose a new password for your RevTaw account.",
    icon: "lock",
    greeting: "Hi there,",
    title: "Reset your password",
    titleAccent: "password",
    paragraphs: ["We received a request to reset the password for your RevTaw account. Click the button below to choose a new one."],
    button: { label: "Reset Password", href: input.link },
    buttonNote: `This link will expire in ${input.expiry} for your security.`,
    showLink: true,
    notice: { icon: "shield", title: "Didn't request this?", body: "If you didn't request a password reset, you can safely ignore this email. Your account is still secure." },
  };
}

export function passwordChangedEmail(input: { email: string; secureLink: string }): EmailContent {
  return {
    subject: "Your RevTaw password was changed",
    preheader: "The password for your RevTaw account was just changed.",
    icon: "shield",
    greeting: "Hi there,",
    title: "Your password was changed",
    titleAccent: "changed",
    paragraphs: [`The password for your RevTaw account (${input.email}) was successfully updated.`, "If you made this change, you're all set. There's nothing else to do."],
    notice: {
      icon: "alert",
      title: "Didn't make this change?",
      body: `Secure your account immediately: reset your password with the button below, then let us know at ${BRAND.contactEmail}.`,
      placement: "before-button",
    },
    button: { label: "Secure My Account", href: input.secureLink },
  };
}

export function confirmSignupEmail(input: { link: string; expiry: string }): EmailContent {
  return {
    subject: "Confirm your RevTaw account",
    preheader: "Confirm your email to finish setting up RevTaw.",
    icon: "check",
    greeting: "Hi there,",
    title: "Confirm your RevTaw account",
    titleAccent: "RevTaw account",
    paragraphs: ["Thanks for signing up! Confirm your email address to finish setting up your account and start studying."],
    button: { label: "Confirm Email", href: input.link },
    buttonNote: `This link will expire in ${input.expiry}.`,
    showLink: true,
    notice: { icon: "shield", title: "Didn't sign up?", body: "If you didn't create a RevTaw account, you can safely ignore this email. The account stays inactive until the email is confirmed." },
  };
}

export function emailChangeEmail(input: { link: string; currentEmail: string; newEmail: string; expiry: string }): EmailContent {
  return {
    subject: "Confirm your new RevTaw email",
    preheader: "Confirm the new email address for your RevTaw account.",
    icon: "mail",
    greeting: "Hi there,",
    title: "Confirm your new email",
    titleAccent: "new email",
    paragraphs: [`You asked to change the email address of your RevTaw account from ${input.currentEmail} to ${input.newEmail}. Click the button below to confirm the change.`],
    button: { label: "Confirm New Email", href: input.link },
    buttonNote: `This link will expire in ${input.expiry}.`,
    showLink: true,
    notice: { icon: "shield", title: "Didn't ask for this?", body: "Ignore this email and your email address stays the same. To be safe, change your RevTaw password." },
  };
}

// ---------------------------------------------------------------------------
// Planner reminders (one per activity, sent by the scheduler)
// ---------------------------------------------------------------------------

export type ReminderActivity = {
  title: string;
  /** The activity's planner category; null for activities from a study plan. */
  category: "study" | "review" | "assignment" | "project" | "exam" | "class" | "other" | null;
  /** From a study plan (plan or review) rather than added by hand. */
  planned: boolean;
  subject: string | null;
  topic: string | null;
  /** YYYY-MM-DD */
  date: string;
  /** "2:30 PM", or null for any time that day. */
  time: string | null;
  minutes: number;
  notes: string | null;
};

export type ReminderTiming = {
  /** From startPhrase(): "now", "in 30 minutes", "today at 2:30 PM", "tomorrow", "on Tue, Oct 21"… */
  phrase: string;
};

export type ReminderEmailInput = { activity: ReminderActivity; timing: ReminderTiming; subject: string; preheader: string; link: string | null } & Footer;

/** A study session (study or review, or anything a study plan made) rather than another kind of activity. */
export function isStudyActivity(activity: Pick<ReminderActivity, "category" | "planned">): boolean {
  return activity.category === "study" || activity.category === "review" || (activity.category === null && activity.planned);
}

function activityDetails(activity: ReminderActivity): EmailDetail[] {
  return [
    { label: "Activity", value: activity.title },
    activity.subject ? { label: "Subject", value: activity.subject } : null,
    activity.topic ? { label: "Topic", value: activity.topic } : null,
    { label: "Date", value: longDate(activity.date) },
    { label: "Time", value: activity.time ?? "Any time that day" },
    { label: "Duration", value: `${activity.minutes} min` },
    activity.notes ? { label: "Notes", value: activity.notes } : null,
  ].filter((detail): detail is EmailDetail => detail !== null);
}

/** The title's ending from the timing: "starts now", "starts in 30 minutes", or "coming up". */
function startsLine(phrase: string): { text: string; accent: string } {
  if (phrase === "now") return { text: "starts now", accent: "starts now" };
  if (phrase.startsWith("in ")) return { text: `starts ${phrase}`, accent: phrase };
  return { text: "is coming up", accent: "coming up" };
}

export function studyReminderEmail(input: ReminderEmailInput): EmailContent {
  const starts = startsLine(input.timing.phrase);
  const soon = input.timing.phrase === "now" || input.timing.phrase.startsWith("in ");
  // Without a time it is planned for the day; with one, it starts soon or is coming up.
  const planned = `planned ${dayOf(input.timing.phrase)}`;
  const title = !input.activity.time ? `You have a study session ${planned}` : soon ? `Your study session ${starts.text}` : "You have a study session coming up";
  return {
    subject: input.subject,
    preheader: input.preheader,
    icon: input.activity.time ? "clock" : "calendar",
    greeting: null,
    title,
    titleAccent: input.activity.time ? starts.accent : planned,
    paragraphs: ["It's next on your planner. When you're ready, open RevTaw and start it from there."],
    details: activityDetails(input.activity),
    button: input.link ? { label: "Open RevTaw", href: input.link } : null,
    reason: input.reason,
    unsubscribe: input.unsubscribe,
  };
}

const NOUN: Record<Exclude<ReminderActivity["category"], null>, string> = {
  study: "a study activity",
  review: "a review",
  assignment: "an assignment",
  project: "a project task",
  exam: "an exam",
  class: "a class",
  other: "a task",
};

const ICON: Record<Exclude<ReminderActivity["category"], null>, EmailIcon> = {
  study: "checklist",
  review: "checklist",
  assignment: "checklist",
  project: "checklist",
  exam: "calendar-clock",
  class: "calendar",
  other: "checklist",
};

/** "today", "tomorrow" or "on Tue, Oct 21" from a start phrase without a time. */
function dayOf(phrase: string): string {
  const day = phrase.replace(/ at .*$/, "");
  return day === "today" || day === "tomorrow" || day.startsWith("on ") ? day : "today";
}

export function plannerNotificationEmail(input: ReminderEmailInput): EmailContent {
  const category = input.activity.category ?? "other";
  const noun = NOUN[category];
  const day = dayOf(input.timing.phrase);
  let title: string;
  let accent: string;
  if (input.activity.time) {
    const starts = startsLine(input.timing.phrase);
    const soon = input.timing.phrase === "now" || input.timing.phrase.startsWith("in ");
    title = soon ? `Your ${noun.replace(/^an? /, "")} ${starts.text}` : `You have ${noun} coming up`;
    accent = starts.accent;
  } else {
    // Something to finish that day reads as due; a class or an exam simply happens that day.
    const due = category === "class" || category === "exam" ? day : `due ${day}`;
    title = `You have ${noun} ${due}`;
    accent = due;
  }
  return {
    subject: input.subject,
    preheader: input.preheader,
    icon: input.activity.time ? (category === "class" || category === "exam" ? ICON[category] : "clock") : ICON[category],
    greeting: null,
    title,
    titleAccent: accent,
    paragraphs: ["It's on your planner. Here are the details."],
    details: activityDetails(input.activity),
    button: input.link ? { label: "View Planner", href: input.link } : null,
    reason: input.reason,
    unsubscribe: input.unsubscribe,
  };
}

// ---------------------------------------------------------------------------
// The daily email: it leads with the most urgent thing, and lists the rest
// ---------------------------------------------------------------------------

export type DailyEmailInput = { subject: string; preheader: string; greeting: string; link: string | null; sections: EmailSection[] } & Footer;

export function reviewReminderEmail(input: DailyEmailInput & { dueReviews: number }): EmailContent {
  const reviews = plural(input.dueReviews, "review", "reviews");
  return {
    subject: input.subject,
    preheader: input.preheader,
    icon: "refresh",
    greeting: input.greeting,
    title: `You have ${reviews} due today`,
    titleAccent: reviews,
    paragraphs: ["A few minutes now keeps them from slipping. RevTaw brings each card back right before you'd forget it."],
    button: input.link ? { label: "Start Reviewing", href: input.link } : null,
    sections: input.sections,
    reason: input.reason,
    unsubscribe: input.unsubscribe,
  };
}

export type ExamSummary = {
  title: string;
  daysLeft: number;
  /** YYYY-MM-DD */
  date: string;
  subject: string | null;
  /** "4 of 10 planned activities done" */
  progress: string | null;
  weakTopics: string[];
};

export function examEmail(input: DailyEmailInput & { exam: ExamSummary }): EmailContent {
  const when = daysFromNow(input.exam.daysLeft);
  const details: EmailDetail[] = [
    { label: "Exam date", value: longDate(input.exam.date) },
    input.exam.subject ? { label: "Subject", value: input.exam.subject } : null,
    input.exam.progress ? { label: "Study progress", value: input.exam.progress } : null,
    input.exam.weakTopics.length ? { label: "Weak topics", value: input.exam.weakTopics.join(", ") } : null,
  ].filter((detail): detail is EmailDetail => detail !== null);
  return {
    subject: input.subject,
    preheader: input.preheader,
    icon: "calendar-clock",
    greeting: input.greeting,
    title: `Your ${input.exam.title} is ${when}`,
    titleAccent: when,
    paragraphs: [
      input.exam.daysLeft <= 0
        ? "A short warm-up on what needs the most work is the best use of the time you have."
        : "Short sessions every day beat one long night. Smart Study starts with what needs the most work.",
    ],
    details,
    button: input.link ? { label: "Start Smart Study", href: input.link } : null,
    sections: input.sections,
    reason: input.reason,
    unsubscribe: input.unsubscribe,
  };
}

export function todaysPlanEmail(input: DailyEmailInput & { tasks: Array<{ title: string; time: string | null; minutes: number }> }): EmailContent {
  const activities = plural(input.tasks.length, "activity", "activities");
  return {
    subject: input.subject,
    preheader: input.preheader,
    icon: "checklist",
    greeting: input.greeting,
    title: `You have ${activities} planned today`,
    titleAccent: activities,
    paragraphs: ["Here's your plan for today. Tick each one off in your planner as you go."],
    details: input.tasks.map((task) => ({ label: task.time ?? "Any time", value: `${task.title} · ${task.minutes} min` })),
    button: input.link ? { label: "View Planner", href: input.link } : null,
    sections: input.sections,
    reason: input.reason,
    unsubscribe: input.unsubscribe,
  };
}

// ---------------------------------------------------------------------------
// Welcome and anything else
// ---------------------------------------------------------------------------

export function welcomeEmail(input: { name: string | null; link: string | null }): EmailContent {
  return {
    subject: "Welcome to RevTaw",
    preheader: "Your reviewer just got smarter.",
    icon: "sparkles",
    greeting: greetingFor(input.name),
    title: "Welcome to RevTaw",
    titleAccent: "RevTaw",
    paragraphs: [
      "Your reviewer just got smarter.",
      "Upload your notes, PDFs or screenshots, and RevTaw turns them into reviewers, quizzes and flashcards. Tamari, your study buddy, explains what's unclear and reminds you what to review next.",
    ],
    button: input.link ? { label: "Start Studying", href: input.link } : null,
    notice: { icon: "book", title: "A good first step", body: "Upload one lesson you're studying this week, then make a reviewer or a quiz from it." },
    reason: "You're getting this email because you just created a RevTaw account.",
  };
}

/** A flexible email for future notifications: any icon, title, text, optional button and notice. */
export function notificationEmail(input: {
  subject: string;
  preheader?: string;
  icon?: EmailIcon;
  greeting?: string | null;
  title: string;
  titleAccent?: string | null;
  body: string | string[];
  details?: EmailDetail[];
  button?: EmailLink | null;
  notice?: EmailNotice | null;
} & Footer): EmailContent {
  const paragraphs = Array.isArray(input.body) ? input.body : [input.body];
  return {
    subject: input.subject,
    preheader: input.preheader ?? paragraphs[0] ?? input.title,
    icon: input.icon ?? "bell",
    greeting: input.greeting ?? null,
    title: input.title,
    titleAccent: input.titleAccent ?? null,
    paragraphs,
    details: input.details,
    button: input.button ?? null,
    notice: input.notice ?? null,
    reason: input.reason,
    unsubscribe: input.unsubscribe,
  };
}
