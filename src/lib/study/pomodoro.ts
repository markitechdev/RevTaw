/**
 * The focus rounds of a Pomodoro block with a set length (a plan's or a routine's block, a planner task),
 * where the student picks no preset. Pure and client-safe.
 */

const ROUND = 30;
const BREAK = 5;

/**
 * A block shorter than a round is one focus period of its own length. A longer one is filled with rounds of
 * about 25 minutes of focus and 5 of break: 30 minutes is 25/5, 50 is 20/5 twice, 90 is 25/5 three times.
 */
export function pomodoroSplit(minutes: number): { workMinutes: number; breakMinutes: number } {
  const total = Math.max(1, Math.min(480, Math.round(minutes)));
  if (total < ROUND) return { workMinutes: total, breakMinutes: BREAK };
  const rounds = Math.max(1, Math.round(total / ROUND));
  return { workMinutes: Math.max(10, Math.min(60, Math.round(total / rounds) - BREAK)), breakMinutes: BREAK };
}
