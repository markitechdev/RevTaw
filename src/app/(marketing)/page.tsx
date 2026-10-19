import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  Brain,
  CalendarCheck,
  FileUp,
  Gauge,
  Sparkles,
  Target,
} from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";

const BENEFITS = [
  { icon: FileUp, title: "Upload anything", body: "PDFs, Word files, screenshots, photos of notes, or pasted text." },
  { icon: BookOpenCheck, title: "Generate reviewers", body: "Summaries, bullet notes, key concepts, definitions, Cornell notes, cheat sheets." },
  { icon: Brain, title: "Practice intelligently", body: "Quizzes and flashcards built from your own material, not generic question banks." },
  { icon: Sparkles, title: "Learn with proven methods", body: "Active recall, spaced repetition, Feynman, Pomodoro, and more — each one changes how the session works." },
  { icon: Target, title: "Identify weak areas", body: "RevTaw notices what you keep getting wrong and brings it back at the right time." },
  { icon: CalendarCheck, title: "Prepare for exams", body: "Set an exam date and get a plan that adapts when you miss a day or improve faster." },
  { icon: Gauge, title: "Track mastery", body: "See which topics are solid and which still need work, per concept, not just per quiz." },
];

const STEPS = [
  { n: "01", title: "Upload", body: "Add your class materials. RevTaw extracts the text and finds the topics, definitions, and likely exam points." },
  { n: "02", title: "Study", body: "Pick a study method or let RevTaw choose one. Reviewers, quizzes, and flashcards come from your own notes." },
  { n: "03", title: "Recall and practice", body: "Answer before you see the solution. Rate your confidence. Mistakes go into your notebook automatically." },
  { n: "04", title: "Review and master", body: "Weak concepts come back on a schedule. Strong ones space out. You see mastery rise topic by topic." },
];

const METHODS = [
  "Active Recall", "Spaced Repetition", "Leitner System", "Feynman Technique", "Blurting", "Pomodoro",
  "Cornell Notes", "SQ3R", "Practice Testing", "Exam Simulation", "Interleaving", "Mistake Notebook",
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
        <div className="max-w-2xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">{BRAND.name}</p>
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            {BRAND.motto}
            <span className="mt-2 block text-2xl font-semibold text-muted-foreground sm:text-3xl">
              {BRAND.tagline}
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            {BRAND.description}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/register" className={buttonClasses({ size: "lg" })}>
              Start Studying
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a href="#how-it-works" className={buttonClasses({ variant: "secondary", size: "lg" })}>
              See How {BRAND.name} Works
            </a>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Free to start. Your materials stay private to your account.
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section id="benefits" className="border-t border-border bg-card/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight">More than a reviewer generator</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {BRAND.name} adapts to the student: it finds weaknesses, guides review sessions, and brings
            material back until you understand it.
          </p>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="rounded-xl border border-border bg-card p-5">
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight">How {BRAND.name} works</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Upload → Analyze → Study → Recall → Practice → Detect weakness → Review → Master.
        </p>
        <ol className="mt-10 grid gap-6 md:grid-cols-2">
          {STEPS.map(({ n, title, body }) => (
            <li key={n} className="flex gap-4">
              <span className="font-mono text-sm font-semibold text-primary" aria-hidden="true">{n}</span>
              <div>
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Study methods */}
      <section id="study-methods" className="border-t border-border bg-card/40">
        <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-bold tracking-tight">Study methods that change the session</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Choosing a method is not just a label. It changes what you see, when answers are revealed,
            how questions are generated, and when material comes back.
          </p>
          <ul className="mt-8 flex flex-wrap gap-2">
            {METHODS.map((m) => (
              <li key={m} className="rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium">
                {m}
              </li>
            ))}
            <li className="rounded-full px-3 py-1.5 text-sm text-muted-foreground">and more</li>
          </ul>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-border bg-primary-soft p-8 sm:p-12">
          <h2 className="text-2xl font-bold tracking-tight">Bitaw mo na kay {BRAND.name}.</h2>
          <p className="mt-2 max-w-xl text-muted-foreground">
            Upload your notes and we&apos;ll help turn them into something you can actually study.
          </p>
          <Link href="/register" className={buttonClasses({ size: "lg", className: "mt-6" })}>
            Create your account
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </>
  );
}
