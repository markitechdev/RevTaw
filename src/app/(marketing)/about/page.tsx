import { ArrowRight, Award, CalendarDays, FolderOpen, Layers, Lightbulb, ListChecks, MessageSquare, ScrollText, Smartphone, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { SocialLinks } from "@/components/marketing/social-links";
import { JsonLd } from "@/components/seo/json-ld";
import { buttonClasses } from "@/components/ui/button";
import { PAGE_TITLE, SECTION_TITLE } from "@/components/ui/typography";
import { BRAND } from "@/lib/brand";
import { getSiteUrl } from "@/lib/env";
import { routes } from "@/lib/routes";
import { CREATOR_DESCRIPTION, profilePageJsonLd } from "@/lib/seo";

/**
 * The creator's page: who develops RevTaw, in words people search for (the full name in the title, heading
 * and first sentence), with ProfilePage structured data and links to their profiles; then why RevTaw exists
 * and what it does, in more detail than the landing page.
 */
export const metadata: Metadata = {
  title: { absolute: `${BRAND.creatorFullName} — Developer of ${BRAND.name}` },
  description: `${BRAND.name} is an AI-powered study and reviewer platform developed by ${BRAND.creatorFullName}.`,
  alternates: { canonical: routes.about },
  openGraph: { type: "profile", title: `${BRAND.creatorFullName} — Developer of ${BRAND.name}`, url: routes.about },
};

/** What RevTaw does, in the order a student meets it: names match the app's (Mistake notebook, Mastery map…). */
const FEATURES = [
  {
    icon: FolderOpen,
    title: "Reads the material you already have",
    body: "Upload PDFs, Word documents and photos of your notes or the board, or paste text. RevTaw pulls out the text, finds the main concepts, and estimates how difficult the material is and how long it takes to study.",
  },
  {
    icon: ScrollText,
    title: "Makes reviewers your way",
    body: "Pick the kind you need: a complete reviewer, a concise summary, bullet notes, key concepts, definitions, a formula sheet, Q&A, Cornell notes, a cheat sheet or an exam reviewer. Edit any section, or have one section written again.",
  },
  {
    icon: ListChecks,
    title: "Quizzes from your own notes",
    body: "Choose the question types (multiple choice, true or false, identification, fill in the blank, short answer, essay, and scenario, case-based or problem-solving questions) and take the quiz in practice or exam mode. Answers come with explanations, and written answers get feedback from the AI.",
  },
  {
    icon: Layers,
    title: "Flashcards that come back on time",
    body: "Decks are made from your material, and each card comes back on a spaced-repetition schedule, just before you would forget it. A miss brings a card back sooner; an easy one waits longer.",
  },
  {
    icon: Lightbulb,
    title: "More than 30 study methods",
    body: "Active recall, the Feynman technique, blurting, Pomodoro, interleaving, mind mapping, the memory palace, practice tests and more. Each one changes the session itself: what you see first, when the answer shows up and what comes back tomorrow. Tamari's Study Plan picks the mix for the time you have.",
  },
  {
    icon: MessageSquare,
    title: "Tamari, your study buddy",
    body: "Ask about your lessons in English, Filipino or Taglish, by typing or by voice. Tamari answers from your own material when it can and shows the part it used, explains things more simply, gives examples, quizzes you, and can guide you with hints instead of giving the answer away.",
  },
  {
    icon: TriangleAlert,
    title: "Catches your weak spots",
    body: "Wrong answers go to your mistake notebook and come back for a retest until they stick. RevTaw also estimates how well you know each concept (an estimate, not a grade), so the Mastery map shows what's exam-ready and what needs another round.",
  },
  {
    icon: CalendarDays,
    title: "Plans around your exams",
    body: "Add an exam, its date and the materials it covers, and RevTaw lays out a day-by-day study plan that adjusts when you miss a day or get ahead. The planner keeps your other study tasks too, with reminders.",
  },
  {
    icon: Award,
    title: "Keeps you going",
    body: "Set study goals for the day or the week, keep your streak, and earn XP, levels and badges as you study.",
  },
  {
    icon: Smartphone,
    title: "Goes where you study",
    body: "RevTaw works on your phone and your computer, in light or dark mode. Reviewers, quizzes and results, flashcard decks, exam plans, your mistake notebook and your progress can be saved as PDF, Word or a printable page.",
  },
] as const;

export default function AboutPage() {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-4 py-12 sm:px-6 sm:py-16">
      <JsonLd data={profilePageJsonLd(getSiteUrl())} />
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-primary">About</p>
        <h1 className={PAGE_TITLE}>{BRAND.creatorFullName}</h1>
        <p className="text-lg text-muted-foreground">{CREATOR_DESCRIPTION}</p>
      </header>

      <section aria-labelledby="about-revtaw" className="flex flex-col gap-3">
        <h2 id="about-revtaw" className={SECTION_TITLE}>
          {BRAND.name}
        </h2>
        <div className="flex flex-col gap-3 text-reading text-foreground/90">
          <p>
            {BRAND.name} is an AI-powered study and reviewer platform developed by {BRAND.creatorFullName}. It turns your notes, PDFs and screenshots into
            reviewers, quizzes and flashcards, plans what to study next, and brings back the parts you&apos;re about to forget, with Tamari, its study
            buddy, to help.
          </p>
          <p>
            <span lang="fil">{BRAND.motto}</span> {BRAND.tagline}
          </p>
        </div>
      </section>

      <section aria-labelledby="why-revtaw" className="flex flex-col gap-3">
        <h2 id="why-revtaw" className={SECTION_TITLE}>
          Why {BRAND.name} exists
        </h2>
        <div className="flex flex-col gap-3 text-reading text-foreground/90">
          <p>
            A summary of your notes is only the start of reviewing. The hard part comes after: testing yourself, finding what you keep getting wrong, and
            still remembering it on the day of the exam. {BRAND.name} was made for that part.
          </p>
          <p>
            That&apos;s what <span lang="fil">&ldquo;{BRAND.motto.replace(/\.$/, "")}&rdquo;</span> means: a reviewer that delivers. {BRAND.name} doesn&apos;t stop at
            making study materials. It guides your review sessions, finds your weak spots, adapts to how you&apos;re doing, and keeps bringing the material
            back until you understand it and remember it.
          </p>
          <p>
            It&apos;s made with Filipino students in mind, from junior high school to college, graduate school and professional review, studying in English,
            Filipino or Taglish. It&apos;s simple enough for everyday studying and thorough enough for serious exam preparation.
          </p>
        </div>
      </section>

      <section aria-labelledby="what-revtaw-does" className="flex flex-col gap-6">
        <h2 id="what-revtaw-does" className={SECTION_TITLE}>
          What {BRAND.name} does
        </h2>
        <ul className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <div>
                <h3 className="font-semibold text-foreground">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>
        <div>
          <Link href={routes.register} className={buttonClasses({ size: "lg" })}>
            Start studying — it&apos;s free
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section aria-labelledby="online-profiles" className="flex flex-col gap-3">
        <h2 id="online-profiles" className={SECTION_TITLE}>
          Online profiles
        </h2>
        <SocialLinks labeled label="Online profiles" />
      </section>
    </article>
  );
}
