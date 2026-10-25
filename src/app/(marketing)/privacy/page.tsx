import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LegalDocument, LegalList, LegalSection, ProcessorList, type LegalHeading } from "@/components/legal/legal-document";
import { TEXT_LINK } from "@/components/ui/text-link";
import { TINT } from "@/components/ui/tint";
import { BRAND } from "@/lib/brand";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Privacy Notice",
  description: "What personal information RevTaw collects, why, who helps process it, how long it is kept, and your rights under the Philippine Data Privacy Act.",
  alternates: { canonical: routes.privacy },
};

const SECTIONS = {
  who: { id: "who-we-are", title: "Who we are" },
  collect: { id: "what-we-collect", title: "What we collect" },
  use: { id: "how-we-use-it", title: "Why we use it" },
  ai: { id: "ai-and-estimates", title: "AI and automatic estimates" },
  share: { id: "who-helps-us", title: "Who helps us run RevTaw" },
  where: { id: "where-it-is-kept", title: "Where your information is kept" },
  keep: { id: "how-long-we-keep-it", title: "How long we keep it" },
  rights: { id: "your-rights", title: "Your choices and rights" },
  minors: { id: "students-under-18", title: "Students under 18" },
  security: { id: "security", title: "How we protect it" },
  cookies: { id: "cookies", title: "Cookies and storage on your device" },
  changes: { id: "changes", title: "Changes to this notice" },
  contact: { id: "contact", title: "Contact us" },
} satisfies Record<string, LegalHeading>;

const mail = `mailto:${BRAND.contactEmail}`;

export default function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Privacy Notice"
      intro={
        <p>
          This notice explains what personal information {BRAND.name} collects, why, who helps us process it, how long we keep it, and the choices and rights
          you have under the Philippine Data Privacy Act of 2012 (Republic Act No. 10173).
        </p>
      }
      notice={
        <div className={cn("flex items-start gap-3 rounded-xl border p-4", TINT.primary)}>
          <Users className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-sm text-foreground">
            <span className="font-semibold">Under 18?</span> Read the{" "}
            <Link href={routes.privacyStudents} className={TEXT_LINK}>
              student version
            </Link>
            , which says the same things in fewer words. A parent or guardian should read this full notice and agree to it before you create an account.
          </p>
        </div>
      }
      contents={Object.values(SECTIONS)}
    >
      <LegalSection heading={SECTIONS.who}>
        <p>
          {BRAND.name} is a free study app made and run by {BRAND.creator} (&ldquo;{BRAND.name}&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). We decide how
          your personal information is used, so we are its personal information controller. You can reach us at{" "}
          <a href={mail} className={TEXT_LINK}>
            {BRAND.contactEmail}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading={SECTIONS.collect}>
        <LegalList>
          <li>
            <strong className="font-semibold text-foreground">Your account:</strong> your name, your email address and your password. Your password goes straight to our
            sign-in provider, which stores it only in scrambled (hashed) form; we don&apos;t keep it.
          </li>
          <li>
            <strong className="font-semibold text-foreground">Your study setup and settings:</strong> your education level, main goal, session length, preferred
            methods, time zone, and your appearance, notification and Tamari settings.
          </li>
          <li>
            <strong className="font-semibold text-foreground">What you add:</strong> the files you upload and the notes you paste, the text we read from them,
            and the titles, subjects and folders you give them.
          </li>
          <li>
            <strong className="font-semibold text-foreground">What {BRAND.name} makes and records while you study:</strong> reviewers, quizzes, flashcards,
            memory aids, exams, plans and tasks, your answers and scores, your mistake notebook, study sessions and study time, how well you know each topic, XP
            and badges, notifications, your conversations with Tamari, and how much you use the AI each day (for the AI limits).
          </li>
          <li>
            <strong className="font-semibold text-foreground">Your voice, only when you press the microphone:</strong> the words you say. If your browser
            can&apos;t turn speech into text by itself, a short recording is sent for transcription; {BRAND.name} doesn&apos;t keep the recording.
          </li>
          <li>
            <strong className="font-semibold text-foreground">Google Calendar, only if you connect it:</strong> a key that lets {BRAND.name} update the one
            calendar it makes for your plan, stored encrypted.
          </li>
          <li>
            <strong className="font-semibold text-foreground">Technical information:</strong> your IP address and browser details, which our servers and sign-in
            provider see with every request and keep in their logs for a limited time. We also use them, scrambled, to count attempts and stop abuse.
          </li>
          <li>
            <strong className="font-semibold text-foreground">Usage analytics, only if you turn it on:</strong> which features you use, without what you wrote or
            uploaded.
          </li>
        </LegalList>
        <p>
          We don&apos;t ask for your school, address, phone number, birthday or ID numbers, and we don&apos;t use your location. Please don&apos;t upload other
          people&apos;s personal information (such as class lists or classmates&apos; grades) or sensitive information (such as medical records or ID numbers) that
          you don&apos;t need for studying.
        </p>
      </LegalSection>

      <LegalSection heading={SECTIONS.use}>
        <LegalList>
          <li>
            <strong className="font-semibold text-foreground">To give you RevTaw:</strong> making reviewers, quizzes, flashcards and study plans from your
            materials, checking your answers, tracking your progress and answering you as Tamari. We need this information to provide the service you signed up
            for. For a student under 18, we rely on the agreement of a parent or guardian.
          </li>
          <li>
            <strong className="font-semibold text-foreground">To keep RevTaw safe and working:</strong> protecting sign-in, limiting attempts so forms
            can&apos;t be abused, and finding and fixing errors. This is our legitimate interest in a secure, working service.
          </li>
          <li>
            <strong className="font-semibold text-foreground">To email you:</strong> account emails (confirming your address, resetting your password) whenever
            you ask for them. Study reminders and the daily summary only after you turn them on in Settings → Notifications; every one has an unsubscribe link.
          </li>
          <li>
            <strong className="font-semibold text-foreground">To improve RevTaw:</strong> usage analytics, only with your consent (Settings → Account →
            Privacy). It is off until you turn it on, and you can turn it off at any time.
          </li>
          <li>
            <strong className="font-semibold text-foreground">When the law requires it:</strong> for example, to answer a lawful order or to report a data
            breach to the National Privacy Commission.
          </li>
        </LegalList>
        <p>
          We don&apos;t sell your information, show ads, or share your information with advertisers, your school, or other students.
        </p>
      </LegalSection>

      <LegalSection heading={SECTIONS.ai}>
        <p>
          {BRAND.name} uses AI to read your materials and write study tools from them. AI can make mistakes, so check what it writes against your own materials
          and your teachers. We don&apos;t use your materials or answers to train AI models.
        </p>
        <p>
          {BRAND.name} also estimates how well you know each topic from your answers, and uses those estimates to choose what to review next, plan your study
          days and suggest study methods. The estimates only shape your suggestions inside {BRAND.name}; they aren&apos;t shared with your school or anyone else,
          and you can always change your plan or study something else. We make no decisions about you that have legal or similarly important effects by
          automatic means alone.
        </p>
      </LegalSection>

      <LegalSection heading={SECTIONS.share}>
        <p>
          These companies process information for us, each only for the job below and under its own privacy and security terms. If we add a company that
          receives your information, we&apos;ll add it here first.
        </p>
        <ProcessorList />
        <p>
          If you use the microphone in a browser that turns speech into text itself (such as Chrome), your browser may send your voice to its maker (such as
          Google) under the browser&apos;s own terms. We may also disclose information when the law requires it.
        </p>
      </LegalSection>

      <LegalSection heading={SECTIONS.where}>
        <p>
          {BRAND.name}&apos;s database, files and servers are in Sydney, Australia. Some of the companies above also process information in other countries,
          including the United States and the European Union. We remain responsible for your information wherever it is processed.
        </p>
      </LegalSection>

      <LegalSection heading={SECTIONS.keep}>
        <LegalList>
          <li>Your account and study information: for as long as you keep your account.</li>
          <li>
            A material you delete goes to the Archive for 30 days, so you can restore it. Then its file, its text and its analysis are deleted for good. What you
            made from it (reviewers, quizzes, flashcards, progress) stays until you delete it.
          </li>
          <li>Other things you delete (a quiz, a deck, a reviewer, a goal, a chat with Tamari) are deleted right away.</li>
          <li>
            When you delete your account, everything is deleted, including your files, and {BRAND.name}&apos;s access to your Google Calendar is withdrawn.
            Copies in backups and logs are removed as those are replaced.
          </li>
          <li>The scrambled counts of attempts that stop abuse: from one minute to a day.</li>
        </LegalList>
      </LegalSection>

      <LegalSection heading={SECTIONS.rights}>
        <p>Most of your choices are in {BRAND.name} itself:</p>
        <LegalList>
          <li>
            <strong className="font-semibold text-foreground">See and download:</strong> everything you add and make is in your account, and reviewers,
            quizzes, results, flashcard decks, exam plans, your mistake notebook and your progress can be saved as PDF, Word or a printable page.
          </li>
          <li>
            <strong className="font-semibold text-foreground">Correct:</strong> change your name in Settings → Profile and your choices anywhere in Settings;
            edit or remake what {BRAND.name} wrote.
          </li>
          <li>
            <strong className="font-semibold text-foreground">Delete:</strong> delete any material or anything made from it, or your whole account in Settings →
            Account.
          </li>
          <li>
            <strong className="font-semibold text-foreground">Say no:</strong> turn off reminder emails and the daily summary (Settings → Notifications, or the
            unsubscribe link in any email), usage analytics (Settings → Account), and Tamari&apos;s voice commands, spoken answers and study suggestions (Settings → Tamari &amp;
            AI); disconnect Google Calendar (Settings → Notifications).
          </li>
        </LegalList>
        <p>
          Under the Data Privacy Act you also have the right to be informed, to access your information, to object to its processing, to have it corrected, to
          have it erased or blocked, to receive a copy in a commonly used electronic format, and to claim damages; your lawful heirs can exercise these rights for you if you no longer can.
          For anything you can&apos;t do in the app, email{" "}
          <a href={mail} className={TEXT_LINK}>
            {BRAND.contactEmail}
          </a>{" "}
          from the address on your account. We&apos;ll reply as soon as we can.
        </p>
        <p>
          If you believe your rights were violated, you can file a complaint with the{" "}
          <a href="https://privacy.gov.ph" rel="noopener noreferrer" target="_blank" className={TEXT_LINK}>
            National Privacy Commission
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          . We&apos;d be grateful for the chance to fix it first.
        </p>
      </LegalSection>

      <LegalSection heading={SECTIONS.minors}>
        <p>{BRAND.name} is for students of all ages. For a student under 18:</p>
        <LegalList>
          <li>
            A parent or guardian must read and agree to this notice and the{" "}
            <Link href={routes.terms} className={TEXT_LINK}>
              Terms of Use
            </Link>{" "}
            before the student creates an account. The sign-up form asks for this.
          </li>
          <li>
            The most private choices come first: usage analytics, reminder emails and the daily summary are off until turned on, and nothing a student adds or
            makes is shown to anyone else.
          </li>
          <li>
            A parent or guardian can ask us to see, correct or delete a student&apos;s information by writing to{" "}
            <a href={mail} className={TEXT_LINK}>
              {BRAND.contactEmail}
            </a>
            . We&apos;ll confirm the request with the email address on the student&apos;s account before acting on it.
          </li>
          <li>
            If a data breach affects a student&apos;s information, we&apos;ll tell the student by email and in {BRAND.name}, and ask the student to show the
            message to a parent or guardian.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection heading={SECTIONS.security}>
        <p>
          Everything travels over encrypted connections. Database rules let each account reach only its own information, files are kept in private storage, and
          the Google Calendar key is encrypted. No system is perfectly secure: if a breach is likely to harm you, we&apos;ll tell you and the National Privacy
          Commission as the law requires.
        </p>
      </LegalSection>

      <LegalSection heading={SECTIONS.cookies}>
        <p>{BRAND.name} uses only what it needs to work. There are no advertising or tracking cookies.</p>
        <LegalList>
          <li>Sign-in cookies keep you signed in.</li>
          <li>A cookie remembers your theme color, so pages open in it (up to 400 days).</li>
          <li>A cookie shows your email address on the &ldquo;check your email&rdquo; page after you sign up (15 minutes).</li>
          <li>A cookie remembers the suggestions from Tamari you set aside today (one day).</li>
          <li>A cookie protects the step where you connect Google Calendar (10 minutes).</li>
          <li>
            Your browser&apos;s storage remembers light or dark mode and the front page&apos;s motion setting and, for the open tab only, which chat with Tamari
            is open and which day the planner shows.
          </li>
        </LegalList>
        <p>Usage analytics, when you turn it on, is sent by our servers, not by cookies.</p>
      </LegalSection>

      <LegalSection heading={SECTIONS.changes}>
        <p>
          We&apos;ll post any change on this page and update the date at the top. If a change affects how we use your information in an important way, we&apos;ll
          tell you in {BRAND.name} or by email before it applies.
        </p>
      </LegalSection>

      <LegalSection heading={SECTIONS.contact}>
        <p>
          {BRAND.creator}, {BRAND.name} ·{" "}
          <a href={mail} className={TEXT_LINK}>
            {BRAND.contactEmail}
          </a>
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
