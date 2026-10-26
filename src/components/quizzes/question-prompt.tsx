import { splitTwoStatements } from "@/lib/quizzes/types";
import type { QuestionType } from "@/lib/supabase/database.types";

/** The line a question opens with: a two-statement question's lead-in (its statements follow in StatementPair), any other's whole prompt. */
export function promptLead(type: QuestionType, prompt: string): string {
  const parts = type === "two_statement" ? splitTwoStatements(prompt) : null;
  if (!parts) return prompt;
  return parts.lead || "Which of these statements are true?";
}

/** A two-statement question's statements, numbered as its choices name them. Nothing for other questions. */
export function StatementPair({ type, prompt }: { type: QuestionType; prompt: string }) {
  const parts = type === "two_statement" ? splitTwoStatements(prompt) : null;
  if (!parts) return null;
  return (
    <ol className="mt-3 flex flex-col gap-2 text-sm">
      {parts.statements.map((statement, index) => (
        <li key={index} className="flex flex-col gap-0.5 rounded-lg border border-border bg-muted/40 p-3 leading-relaxed sm:flex-row sm:gap-2">
          <span className="shrink-0 font-semibold text-muted-foreground">Statement {index + 1}.</span>
          <span className="min-w-0">{statement}</span>
        </li>
      ))}
    </ol>
  );
}
