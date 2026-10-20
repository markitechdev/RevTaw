import { ArrowRight, BookOpenCheck, Brain, CalendarCheck, FileUp, Gauge, Lock, Smartphone, Sparkles, Target } from "lucide-react";
import Link from "next/link";

import { Doodles } from "@/components/marketing/doodles";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { MethodExplorer } from "@/components/marketing/method-explorer";
import { Reveal } from "@/components/marketing/reveal";
import { StudyDesk } from "@/components/marketing/study-desk";
import { TypingHeadline } from "@/components/marketing/typing-headline";
import { buttonClasses } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

const CAPABILITIES = [
  { icon: FileUp, title: "Upload anything", body: "PDFs, Word files, photos of the board, or notes you paste in." },
  { icon: BookOpenCheck, title: "Reviewers your way", body: "Summaries, Cornell notes, cheat sheets, definitions — edit any part." },
  { icon: Brain, title: "Practice from your material", body: "Quizzes and flashcards from your own notes, not a generic question bank." },
  { icon: Sparkles, title: "Methods that change the session", body: "Active recall, spaced repetition, Feynman, Pomodoro and 30 more." },
  { icon: Target, title: "Weak spots, caught early", body: "Repeated mistakes come back at the right time until they stick." },
  { icon: CalendarCheck, title: "Exams on a plan", body: "Set the date; the plan adjusts when you miss a day or get ahead." },
  { icon: Gauge, title: "Mastery you can see", body: "Per concept, not just per quiz — so you know what's exam-ready." },
] as const;

const HEADLINE = [BRAND.motto, BRAND.tagline] as const;

export default function LandingPage() {
  return (
    <>
      {/* Hero: the RevTaw line, typed out, next to a desk you can actually use. */}
      <section className="relative overflow-x-clip">
        <div className="mx-auto grid w-full max-w-6xl gap-14 px-4 pb-20 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-10">
          <div className="animate-fade-up">
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
              Bitaw na. Let&apos;s review.
            </p>
            <h1 className="mt-5 text-[clamp(2.4rem,6.2vw,4.25rem)] font-extrabold leading-[1.04] tracking-tight text-foreground">
              <TypingHeadline phrases={HEADLINE} />
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Upload your notes, PDFs or screenshots. {BRAND.name} turns them into reviewers, quizzes and flashcards — then brings back{" "}
              <span className="highlighter text-foreground">the parts you&apos;re about to forget</span>.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/register" className={buttonClasses({ size: "lg" })}>
                Start studying — it&apos;s free
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a href="#how-it-works" className={buttonClasses({ variant: "secondary", size: "lg" })}>
                See how it works
              </a>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <Lock className="h-4 w-4" aria-hidden="true" />
                Your files stay private
              </li>
              <li className="flex items-center gap-1.5">
                <Smartphone className="h-4 w-4" aria-hidden="true" />
                Works on your phone
              </li>
            </ul>
          </div>
          <div className="relative">
            <Doodles />
            <StudyDesk />
          </div>
        </div>
      </section>

      {/* What it does: a list with a clear lead, not a wall of identical cards. */}
      <section id="features" className="border-t border-border bg-card/50">
        <Reveal className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div>
            <p className="text-sm font-semibold text-primary">What it does</p>
            <h2 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">Not just a reviewer generator.</h2>
            <p className="mt-4 max-w-md text-muted-foreground">
              {BRAND.name} keeps track of what you know, what you keep getting wrong and when you need to see it again — so every session counts.
            </p>
          </div>
          <ul className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h3 className="font-semibold text-foreground">{title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
      </section>

      {/* How it works: four steps you can click through. */}
      <section id="how-it-works" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <Reveal>
          <p className="text-sm font-semibold text-primary">How it works</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">From a pile of notes to exam-ready, one loop at a time.</h2>
          <div className="mt-10">
            <HowItWorks />
          </div>
        </Reveal>
      </section>

      {/* Study methods: pick one, see what changes. */}
      <section id="study-methods" className="scroll-mt-20 border-t border-border bg-card/50">
        <Reveal className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <p className="text-sm font-semibold text-primary">Study methods</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-bold leading-tight sm:text-4xl">A method isn&apos;t a label. It changes the session.</h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">What you see first, when the answer shows up and what comes back tomorrow — pick one to see how.</p>
          <div className="mt-10">
            <MethodExplorer />
          </div>
        </Reveal>
      </section>

      {/* Closing call to action. */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
        <Reveal className="relative overflow-hidden rounded-3xl bg-primary px-6 py-12 text-primary-foreground sm:px-12 sm:py-16">
          <svg aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 hidden h-64 w-64 opacity-15 sm:block" viewBox="0 0 40 40" fill="none">
            <path d="M20 4v8M20 28v8M4 20h8M28 20h8M8.7 8.7l5.6 5.6M25.7 25.7l5.6 5.6M8.7 31.3l5.6-5.6M25.7 14.3l5.6-5.6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <p className="font-display text-4xl font-extrabold leading-none tracking-tight sm:text-6xl">
            Bitaw na.
            <span className="relative mt-2 block w-fit">
              Let&apos;s review.
              <svg aria-hidden="true" className="absolute -bottom-3 left-0 h-3 w-full" viewBox="0 0 200 12" preserveAspectRatio="none" fill="none">
                <path d="M3 9c40-6 90-7 194-3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </span>
          </p>
          <p className="mt-7 max-w-lg text-base">Bring the notes you have. {BRAND.name} handles the rest — the reviewer, the quiz and the reminder to come back.</p>
          <Link href="/register" className={buttonClasses({ variant: "secondary", size: "lg", className: "mt-8 border-transparent" })}>
            Create your free account
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Reveal>
      </section>
    </>
  );
}
