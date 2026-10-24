import type { Metadata } from "next";
import Link from "next/link";

import { LegalDocument, LegalList, LegalSection, type LegalHeading } from "@/components/legal/legal-document";
import { TEXT_LINK } from "@/components/ui/text-link";
import { BRAND } from "@/lib/brand";
import { routes } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "The rules for using RevTaw: who can use it, your account and materials, AI-made content, fair use, and what happens if something goes wrong.",
  alternates: { canonical: routes.terms },
};

const SECTIONS = {
  about: { id: "about", title: "About these terms" },
  who: { id: "who-can-use-revtaw", title: "Who can use RevTaw" },
  account: { id: "your-account", title: "Your account" },
  materials: { id: "your-materials", title: "Your materials and what RevTaw makes" },
  ai: { id: "ai-made-content", title: "AI-made content" },
  fair: { id: "fair-use", title: "Fair use" },
  service: { id: "the-service", title: "The service" },
  ending: { id: "ending", title: "Leaving RevTaw, and suspension" },
  liability: { id: "responsibility", title: "Responsibility" },
  law: { id: "law", title: "Law" },
  changes: { id: "changes", title: "Changes to these terms" },
  contact: { id: "contact", title: "Contact us" },
} satisfies Record<string, LegalHeading>;

const mail = `mailto:${BRAND.contactEmail}`;

export default function TermsPage() {
  return (
    <LegalDocument
      eyebrow="Legal"
      title="Terms of Use"
      intro={
        <p>
          These terms are the rules for using {BRAND.name}. By creating an account, you agree to them and to the{" "}
          <Link href={routes.privacy} className={TEXT_LINK}>
            Privacy Notice
          </Link>
          . If you are under 18, a parent or guardian must agree to them too.
        </p>
      }
      contents={Object.values(SECTIONS)}
    >
      <LegalSection heading={SECTIONS.about}>
        <p>
          {BRAND.name} is a free study app made and run by {BRAND.creator} (&ldquo;{BRAND.name}&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;). It turns the
          materials you add into reviewers, quizzes, flashcards, study plans and study sessions, with Tamari to help.
        </p>
      </LegalSection>

      <LegalSection heading={SECTIONS.who}>
        <p>{BRAND.name} is for students of all ages.</p>
        <LegalList>
          <li>
            If you are under 18, you need a parent or guardian&apos;s permission. Your parent or guardian agrees to these terms for you, should help you use{" "}
            {BRAND.name} safely, and is responsible for how you use it.
          </li>
          <li>Each account is for one person. Don&apos;t share it, and don&apos;t make an account for someone else without their permission.</li>
        </LegalList>
      </LegalSection>

      <LegalSection heading={SECTIONS.account}>
        <LegalList>
          <li>Give your real email address, so you can confirm your account and reset your password.</li>
          <li>Keep your password to yourself. You are responsible for what happens in your account.</li>
          <li>
            If you think someone else got into your account, change your password at once and tell us at{" "}
            <a href={mail} className={TEXT_LINK}>
              {BRAND.contactEmail}
            </a>
            .
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection heading={SECTIONS.materials}>
        <LegalList>
          <li>
            What you add, and what {BRAND.name} makes from it for you, is yours. You let us store and process it, including sending it to the AI services listed
            in the{" "}
            <Link href={`${routes.privacy}#who-helps-us`} className={TEXT_LINK}>
              Privacy Notice
            </Link>
            , only to run {BRAND.name} for you.
          </li>
          <li>
            Only add material you are allowed to use for your own studying: your own notes, and handouts, slides or books you have for your classes. Don&apos;t
            use {BRAND.name} to copy and share other people&apos;s work.
          </li>
          <li>
            Don&apos;t upload other people&apos;s personal information or sensitive information you don&apos;t need for studying, or anything illegal, hateful,
            sexual or violent.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection heading={SECTIONS.ai}>
        <p>
          Reviewers, quizzes, flashcards, grades, study plans and Tamari&apos;s answers are made by AI and can be wrong or incomplete. Check them against your
          materials and your teachers. {BRAND.name} is a study aid: it doesn&apos;t replace your school, your teachers or official answer keys, and it is not
          medical, legal or other professional advice.
        </p>
      </LegalSection>

      <LegalSection heading={SECTIONS.fair}>
        <p>Use {BRAND.name} the way it is meant to be used. Don&apos;t:</p>
        <LegalList>
          <li>try to get into accounts or information that aren&apos;t yours, or test, break or get around {BRAND.name}&apos;s security or its limits;</li>
          <li>overload {BRAND.name}, copy it by automated means, or use it to send spam;</li>
          <li>use it to cheat where your school does not allow it, or to bully or harass anyone;</li>
          <li>try to make the AI produce harmful content.</li>
        </LegalList>
        <p>
          The AI has a daily allowance per student so that everyone gets a share. When you reach it, the AI features come back the next day.
        </p>
      </LegalSection>

      <LegalSection heading={SECTIONS.service}>
        <p>
          {BRAND.name} is free. We work to keep it running and your information safe, but it may sometimes be unavailable or slow, and features may change. We
          may set or change limits, such as file sizes or the AI&apos;s daily allowance. Reminder emails, the daily summary and Google Calendar are optional and
          can be turned off at any time.
        </p>
      </LegalSection>

      <LegalSection heading={SECTIONS.ending}>
        <p>
          You can delete your account at any time in Settings → Account; your information is then deleted as the Privacy Notice explains. If an account breaks
          these terms, we may limit or suspend it. Where we can, we&apos;ll tell you first and give you a chance to fix the problem.
        </p>
      </LegalSection>

      <LegalSection heading={SECTIONS.liability}>
        <p>
          {BRAND.name} is provided as it is. To the extent the law allows, we are not responsible for losses caused by relying on AI-made content, by the
          service being unavailable, or by events outside our control. Nothing in these terms takes away rights you have under the law that cannot be waived.
        </p>
      </LegalSection>

      <LegalSection heading={SECTIONS.law}>
        <p>These terms are governed by the laws of the Philippines.</p>
      </LegalSection>

      <LegalSection heading={SECTIONS.changes}>
        <p>
          We&apos;ll post any change on this page and update the date at the top. If a change is important, we&apos;ll tell you in {BRAND.name} or by email
          before it applies. If you don&apos;t agree with a change, you can delete your account.
        </p>
      </LegalSection>

      <LegalSection heading={SECTIONS.contact}>
        <p>
          Questions about these terms:{" "}
          <a href={mail} className={TEXT_LINK}>
            {BRAND.contactEmail}
          </a>
          .
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
