/**
 * The Privacy Notice and Terms of Use: their version (stored with each sign-up's agreement) and the
 * companies that process students' information, listed once for the notice and its student version.
 * Change LEGAL_VERSION and LEGAL_UPDATED together whenever either page changes in substance.
 */

export const LEGAL_VERSION = "2026-10-26";
export const LEGAL_UPDATED = "October 26, 2026";

export type Processor = {
  name: string;
  /** When it is used at all, for the optional ones. */
  only?: string;
  does: string;
  receives: string;
  policies: Array<{ label: string; href: string }>;
};

export const PROCESSORS: Processor[] = [
  {
    name: "Supabase",
    does: "Keeps RevTaw's database and your files, and handles signing in.",
    receives: "Everything RevTaw keeps for your account.",
    policies: [{ label: "Supabase's privacy policy", href: "https://supabase.com/privacy" }],
  },
  {
    name: "Vercel",
    does: "Runs the RevTaw website and its servers.",
    receives: "What your browser sends while you use RevTaw, including your IP address.",
    policies: [{ label: "Vercel's privacy notice", href: "https://vercel.com/legal/privacy-notice" }],
  },
  {
    name: "Groq and Cloudflare Workers AI",
    does: "The AI behind RevTaw: it writes reviewers, quizzes and flashcards, grades written answers, reads photos of notes, answers as Tamari, powers search, and turns short voice recordings into text.",
    receives:
      "The part of your material, question or answer being worked on; when you ask Tamari, a short summary of where you stand (your weakest topics, what's due, your next exam and your latest mistakes); and a voice recording when your browser can't turn speech into text by itself.",
    policies: [
      { label: "Groq's privacy policy", href: "https://groq.com/privacy-policy" },
      { label: "Cloudflare's privacy policy", href: "https://www.cloudflare.com/privacypolicy/" },
    ],
  },
  {
    name: "Ollama",
    only: "Only when RevTaw's main AI services are busy, or a request is too long for them.",
    does: "A backup for the AI above: it reads your materials, writes reviewers, quizzes and flashcards, grades written answers and answers as Tamari.",
    receives:
      "The part of your material, question or answer being worked on, and, when you ask Tamari, a short summary of where you stand (your weakest topics, what's due, your next exam and your latest mistakes).",
    policies: [{ label: "Ollama's privacy policy", href: "https://ollama.com/privacy" }],
  },
  {
    name: "Microsoft Azure AI Speech",
    does: "Reads Tamari's Filipino answers aloud when your device has no Filipino voice.",
    receives: "The text being read aloud.",
    policies: [{ label: "Microsoft's privacy statement", href: "https://privacy.microsoft.com/privacystatement" }],
  },
  {
    name: "Resend",
    does: "Sends RevTaw's emails.",
    receives: "Your email address and name, and what the email says.",
    policies: [{ label: "Resend's privacy policy", href: "https://resend.com/legal/privacy-policy" }],
  },
  {
    name: "Google",
    only: "Only if you connect Google Calendar.",
    does: "Shows your study plan in your Google Calendar.",
    receives: "Your planner's tasks and exams (titles, times and notes), copied to the one calendar RevTaw makes for them.",
    policies: [{ label: "Google's privacy policy", href: "https://policies.google.com/privacy" }],
  },
  {
    name: "Cloudflare Turnstile",
    only: "Only while the sign-up and sign-in check is on.",
    does: "Checks that a person, not a bot, is using the sign-up, sign-in and password forms.",
    receives: "Information about your browser and connection.",
    policies: [{ label: "Cloudflare's privacy policy", href: "https://www.cloudflare.com/privacypolicy/" }],
  },
  {
    name: "PostHog (EU)",
    only: "Only if you turn on usage analytics.",
    does: "Counts which features are used, so RevTaw can be improved.",
    receives: "The names of the features you use and a scrambled ID. Never your content, name or email.",
    policies: [{ label: "PostHog's privacy policy", href: "https://posthog.com/privacy" }],
  },
];
