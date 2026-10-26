"use client";

import { Input, Textarea } from "@/components/ui/input";
import type { RunnerQuestion } from "@/lib/quizzes/queries";
import { optionLetter, type QuestionResponse } from "@/lib/quizzes/types";
import { cn } from "@/lib/utils";

/** Renders the right control for a question type; the value is the stored response shape. */
export function QuestionInput({
  question,
  value,
  disabled,
  onChange,
}: {
  question: RunnerQuestion;
  value: QuestionResponse | null;
  disabled?: boolean;
  onChange: (value: QuestionResponse | null) => void;
}) {
  const inputId = `answer-${question.id}`;

  if (question.type === "multiple_choice") {
    const selected = value && "option_id" in value ? value.option_id : null;
    return (
      <fieldset disabled={disabled} className="flex flex-col gap-2">
        <legend className="sr-only">Options</legend>
        {(question.options ?? []).map((option, position) => (
          <label
            key={option.id}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm transition-colors",
              "hover:bg-muted/60 has-checked:border-primary has-checked:bg-primary-soft",
              disabled && "cursor-default opacity-90",
            )}
          >
            <input
              type="radio"
              name={`question-${question.id}`}
              value={option.id}
              checked={selected === option.id}
              onChange={() => onChange({ option_id: option.id })}
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
            />
            <span className="flex min-w-0 gap-2">
              <span className="font-semibold text-muted-foreground">{optionLetter(position)}.</span>
              <span>{option.text}</span>
            </span>
          </label>
        ))}
      </fieldset>
    );
  }

  if (question.type === "true_false") {
    const selected = value && "value" in value ? value.value : null;
    return (
      <fieldset disabled={disabled} className="grid grid-cols-2 gap-2">
        <legend className="sr-only">True or false</legend>
        {[
          [true, "True"],
          [false, "False"],
        ].map(([option, label]) => (
          <label
            key={String(option)}
            className={cn(
              "flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-card p-3 text-sm font-medium transition-colors",
              "hover:bg-muted/60 has-checked:border-primary has-checked:bg-primary-soft",
              disabled && "cursor-default opacity-90",
            )}
          >
            <input
              type="radio"
              name={`question-${question.id}`}
              value={String(option)}
              checked={selected === option}
              onChange={() => onChange({ value: option as boolean })}
              className="h-4 w-4 accent-primary"
            />
            {label}
          </label>
        ))}
      </fieldset>
    );
  }

  const text = value && "text" in value ? value.text : "";
  const short = question.type === "identification" || question.type === "fill_blank";
  const rows = question.type === "short_answer" ? 3 : 8;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {short ? "Your answer" : "Write your answer"}
      </label>
      {short ? (
        <Input
          id={inputId}
          value={text}
          maxLength={300}
          autoComplete="off"
          disabled={disabled}
          placeholder={question.type === "fill_blank" ? "The missing word or phrase" : "The term or name"}
          onChange={(event) => onChange(event.target.value ? { text: event.target.value } : null)}
        />
      ) : (
        <Textarea
          id={inputId}
          value={text}
          rows={rows}
          maxLength={4000}
          disabled={disabled}
          placeholder={
            question.type === "problem_solving"
              ? "Show your steps and state the final answer."
              : question.type === "short_answer"
                ? "One or two sentences."
                : "Explain in your own words, using what the material says."
          }
          onChange={(event) => onChange(event.target.value ? { text: event.target.value } : null)}
        />
      )}
      {!short && <p className="text-xs text-muted-foreground">{text.length}/4000 characters</p>}
    </div>
  );
}
