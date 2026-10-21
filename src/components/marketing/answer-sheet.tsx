import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

/** Mastery levels 1–5: the choices printed across an answer sheet. */
export const ANSWER_LEVELS = [1, 2, 3, 4, 5] as const;

/** Each shaded oval leans a little differently, the way a pencil actually fills them in. */
const TILTS = [-6, -3, -5, -2, -4] as const;

/**
 * Five answer-sheet ovals with the first `level` shaded in pencil, one after
 * another (`.answer-shade` in globals.css; instant with reduced motion).
 * Decorative: say the level in text next to it. `shaded={false}` leaves them
 * blank until the caller is ready to fill them in.
 */
export function AnswerOvals({ level, shaded = true, delay = 0, className }: { level: number; shaded?: boolean; delay?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("flex gap-1.5", className)}>
      {ANSWER_LEVELS.map((value, index) => (
        <span key={value} className="relative block h-3.5 w-5 rounded-[50%] border-[1.5px] border-primary">
          {shaded && value <= level && (
            <span className="answer-shade" style={{ "--shade-tilt": `${TILTS[index]}deg`, "--shade-delay": `${delay + index * 70}ms` } as CSSProperties} />
          )}
        </span>
      ))}
    </span>
  );
}
