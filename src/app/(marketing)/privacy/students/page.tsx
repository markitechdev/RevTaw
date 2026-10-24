import type { Metadata } from "next";
import Link from "next/link";

import { LegalDocument, LegalList, LegalSection, type LegalHeading } from "@/components/legal/legal-document";
import { TEXT_LINK } from "@/components/ui/text-link";
import { BRAND } from "@/lib/brand";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Your privacy, in plain words",
  description: `RevTaw's Privacy Notice for students under 18, in plain words.`,
  alternates: { canonical: routes.privacyStudents },
};

const SECTIONS = {
  grownUp: { id: "ask-a-grown-up", title: "First, ask a grown-up" },
  keeps: { id: "what-revtaw-keeps", title: "What RevTaw keeps" },
  why: { id: "why", title: "Why RevTaw keeps it" },
  sees: { id: "who-can-see-it", title: "Who can see it" },
  ai: { id: "about-the-ai", title: "About the AI" },
  voice: { id: "your-voice", title: "Your voice" },
  private: { id: "keep-private-things-private", title: "Keep private things private" },
  charge: { id: "you-are-in-charge", title: "You're in charge" },
  wrong: { id: "if-something-goes-wrong", title: "If something goes wrong" },
  questions: { id: "questions", title: "Questions?" },
} satisfies Record<string, LegalHeading>;

const mail = `mailto:${BRAND.contactEmail}`;

export default function StudentPrivacyPage() {
  return (
    <LegalDocument
      eyebrow="For students"
      title="Your privacy, in plain words"
      intro={
        <p>
          This page explains what {BRAND.name} does with your information. It says the same things as the{" "}
          <Link href={routes.privacy} className={TEXT_LINK}>
            full Privacy Notice
          </Link>
          , in fewer words.
        </p>
      }
    >
      <LegalSection heading={SECTIONS.grownUp}>
        <p>
          If you are under 18, a parent or guardian needs to read the{" "}
          <Link href={routes.privacy} className={TEXT_LINK}>
            Privacy Notice
          </Link>{" "}
          and the{" "}
          <Link href={routes.terms} className={TEXT_LINK}>
            Terms of Use
          </Link>{" "}
          and say yes before you make an account. It&apos;s a good idea to read this page together.
        </p>
      </LegalSection>

      <LegalSection heading={SECTIONS.keeps}>
        <LegalList>
          <li>Your name, your email address and your password (locked so no one can read it).</li>
          <li>The files and notes you add.</li>
          <li>What {BRAND.name} makes for you: reviewers, quizzes, flashcards and study plans.</li>
          <li>How you&apos;re doing: your answers, scores, study time, XP and badges.</li>
          <li>Your chats with Tamari.</li>
        </LegalList>
        <p>{BRAND.name} never asks for your school, address, phone number, birthday or location.</p>
      </LegalSection>

      <LegalSection heading={SECTIONS.why}>
        <LegalList>
          <li>To make your study tools and check your answers.</li>
          <li>To show your progress and pick what to review next.</li>
          <li>To keep your account safe.</li>
          <li>To send reminders, but only if you turn them on.</li>
        </LegalList>
      </LegalSection>

      <LegalSection heading={SECTIONS.sees}>
        <p>
          Only you. Not other students, not your teachers or your school, and not advertisers. {BRAND.name} never sells your information and shows no ads.
        </p>
        <p>
          A few companies help {BRAND.name} work: they store your things, run the AI and send emails. Each one gets only what it needs for its job. The{" "}
          <Link href={`${routes.privacy}#who-helps-us`} className={TEXT_LINK}>
            full notice lists them
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection heading={SECTIONS.ai}>
        <p>
          The AI reads your notes to make quizzes and flashcards, and it answers you as Tamari. It can be wrong, so check with your notes and your teachers.{" "}
          {BRAND.name} doesn&apos;t use your work to train AI.
        </p>
      </LegalSection>

      <LegalSection heading={SECTIONS.voice}>
        <p>{BRAND.name} only listens when you press the microphone, and it doesn&apos;t keep recordings.</p>
      </LegalSection>

      <LegalSection heading={SECTIONS.private}>
        <p>Don&apos;t upload your ID, your address, your passwords, or other people&apos;s information, like a class list or a classmate&apos;s grades.</p>
      </LegalSection>

      <LegalSection heading={SECTIONS.charge}>
        <LegalList>
          <li>Turn emails and reminders on or off in Settings → Notifications.</li>
          <li>Delete anything you added or made, whenever you want.</li>
          <li>Delete your whole account in Settings → Account, and everything goes away.</li>
        </LegalList>
      </LegalSection>

      <LegalSection heading={SECTIONS.wrong}>
        <p>
          If someone who shouldn&apos;t gets into your information, {BRAND.name} will email you. Show that email to your parent or guardian.
        </p>
      </LegalSection>

      <LegalSection heading={SECTIONS.questions}>
        <p>
          You, your parent or your guardian can email{" "}
          <a href={mail} className={TEXT_LINK}>
            {BRAND.contactEmail}
          </a>
          .
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
