/**
 * Badges and milestones (spec §31): each one is a plain rule over the
 * student's evidence, so they can be re-evaluated at any time and never go
 * out of step with the data. Definitions are client-safe; unlocking happens
 * on the server. Tone: plain and adult — a record of what was done, not
 * confetti.
 */

export type AchievementGroup = "sessions" | "answers" | "reviews" | "streak" | "mastery" | "methods" | "milestones";

/** What the rules look at: counts derived from the evidence tables. */
export type GamificationStats = {
  sessionsCompleted: number;
  sessionsByMethod: Record<string, number>;
  methodsUsed: number;
  questionsAnswered: number;
  correctAnswers: number;
  flashcardsReviewed: number;
  currentStreak: number;
  longestStreak: number;
  conceptsMastered: number;
  materials: number;
  focusMinutes: number;
  bestQuizPercent: number | null;
  goalsReached: number;
  preTestImprovements: number;
  palaceWalks: number;
  mnemonicsSaved: number;
};

export type AchievementDef = {
  key: string;
  title: string;
  /** What it takes, in the second person. */
  description: string;
  group: AchievementGroup;
  /** Lucide icon name rendered by the client. */
  icon: "play" | "layers" | "list-checks" | "flame" | "award" | "brain" | "compass" | "clock" | "target" | "trending-up" | "castle" | "book-open" | "graduation-cap" | "sparkles";
  /** The number the rule counts towards, for a progress hint; null for yes/no badges. */
  target: number | null;
  /** How far the student is, from the same stats the rule reads. */
  progress: (stats: GamificationStats) => number;
};

const countOf = (pick: (stats: GamificationStats) => number) => pick;

export const ACHIEVEMENTS: ReadonlyArray<AchievementDef> = [
  // Sessions
  { key: "first_session", title: "First session", description: "Finish your first study session.", group: "sessions", icon: "play", target: 1, progress: countOf((s) => s.sessionsCompleted) },
  { key: "sessions_10", title: "Ten sessions", description: "Finish ten study sessions.", group: "sessions", icon: "play", target: 10, progress: countOf((s) => s.sessionsCompleted) },
  { key: "sessions_50", title: "Fifty sessions", description: "Finish fifty study sessions.", group: "sessions", icon: "play", target: 50, progress: countOf((s) => s.sessionsCompleted) },
  { key: "active_recall_beginner", title: "Active Recall Beginner", description: "Finish an active recall session.", group: "methods", icon: "brain", target: 1, progress: countOf((s) => s.sessionsByMethod.active_recall ?? 0) },
  { key: "active_recall_regular", title: "Active Recall Regular", description: "Finish ten active recall sessions.", group: "methods", icon: "brain", target: 10, progress: countOf((s) => s.sessionsByMethod.active_recall ?? 0) },
  { key: "methods_5", title: "Method explorer", description: "Use five different study methods.", group: "methods", icon: "compass", target: 5, progress: countOf((s) => s.methodsUsed) },
  { key: "methods_15", title: "Method connoisseur", description: "Use fifteen different study methods.", group: "methods", icon: "compass", target: 15, progress: countOf((s) => s.methodsUsed) },
  { key: "exam_rehearsal", title: "Exam rehearsal", description: "Finish an exam simulation.", group: "methods", icon: "list-checks", target: 1, progress: countOf((s) => s.sessionsByMethod.exam_simulation ?? 0) },
  { key: "memory_architect", title: "Memory architect", description: "Walk a memory palace.", group: "methods", icon: "castle", target: 1, progress: countOf((s) => s.palaceWalks) },
  { key: "before_and_after", title: "Measured improvement", description: "Score higher on a post-test than on its pre-test.", group: "methods", icon: "trending-up", target: 1, progress: countOf((s) => s.preTestImprovements) },
  // Answers
  { key: "questions_100", title: "100 Questions Answered", description: "Answer a hundred questions.", group: "answers", icon: "list-checks", target: 100, progress: countOf((s) => s.questionsAnswered) },
  { key: "questions_500", title: "500 Questions Answered", description: "Answer five hundred questions.", group: "answers", icon: "list-checks", target: 500, progress: countOf((s) => s.questionsAnswered) },
  { key: "questions_1000", title: "1,000 Questions Answered", description: "Answer a thousand questions.", group: "answers", icon: "list-checks", target: 1000, progress: countOf((s) => s.questionsAnswered) },
  { key: "quiz_80", title: "Top marks", description: "Score 80% or more on a quiz.", group: "answers", icon: "target", target: 80, progress: countOf((s) => s.bestQuizPercent ?? 0) },
  // Reviews
  { key: "cards_100", title: "100 cards reviewed", description: "Review a hundred flashcards.", group: "reviews", icon: "layers", target: 100, progress: countOf((s) => s.flashcardsReviewed) },
  { key: "cards_500", title: "500 cards reviewed", description: "Review five hundred flashcards.", group: "reviews", icon: "layers", target: 500, progress: countOf((s) => s.flashcardsReviewed) },
  { key: "mnemonics_5", title: "Memory aids", description: "Save five mnemonics.", group: "reviews", icon: "sparkles", target: 5, progress: countOf((s) => s.mnemonicsSaved) },
  // Streaks
  { key: "streak_3", title: "Three-day streak", description: "Study three days in a row.", group: "streak", icon: "flame", target: 3, progress: countOf((s) => s.longestStreak) },
  { key: "streak_7", title: "Seven-Day Streak", description: "Study seven days in a row.", group: "streak", icon: "flame", target: 7, progress: countOf((s) => s.longestStreak) },
  { key: "streak_14", title: "Two-week streak", description: "Study fourteen days in a row.", group: "streak", icon: "flame", target: 14, progress: countOf((s) => s.longestStreak) },
  { key: "streak_30", title: "Thirty-day streak", description: "Study thirty days in a row.", group: "streak", icon: "flame", target: 30, progress: countOf((s) => s.longestStreak) },
  // Mastery
  { key: "first_mastered", title: "First Topic Mastered", description: "Bring a concept to mastered.", group: "mastery", icon: "graduation-cap", target: 1, progress: countOf((s) => s.conceptsMastered) },
  { key: "mastered_5", title: "Five topics mastered", description: "Bring five concepts to mastered.", group: "mastery", icon: "graduation-cap", target: 5, progress: countOf((s) => s.conceptsMastered) },
  { key: "mastered_20", title: "Twenty topics mastered", description: "Bring twenty concepts to mastered.", group: "mastery", icon: "graduation-cap", target: 20, progress: countOf((s) => s.conceptsMastered) },
  // Milestones
  { key: "first_material", title: "First material", description: "Upload or write your first material.", group: "milestones", icon: "book-open", target: 1, progress: countOf((s) => s.materials) },
  { key: "focus_600", title: "Ten hours of focus", description: "Study for ten hours in total.", group: "milestones", icon: "clock", target: 600, progress: countOf((s) => s.focusMinutes) },
  { key: "focus_3000", title: "Fifty hours of focus", description: "Study for fifty hours in total.", group: "milestones", icon: "clock", target: 3000, progress: countOf((s) => s.focusMinutes) },
  { key: "goals_5", title: "Goal getter", description: "Reach five study goals.", group: "milestones", icon: "award", target: 5, progress: countOf((s) => s.goalsReached) },
];

export const ACHIEVEMENT_BY_KEY: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((achievement) => [achievement.key, achievement]));

export const ACHIEVEMENT_GROUP_LABEL: Record<AchievementGroup, string> = {
  sessions: "Sessions",
  methods: "Methods",
  answers: "Answers",
  reviews: "Reviews and memory aids",
  streak: "Streaks",
  mastery: "Mastery",
  milestones: "Milestones",
};

export function isUnlocked(achievement: AchievementDef, stats: GamificationStats): boolean {
  return achievement.target !== null && achievement.progress(stats) >= achievement.target;
}

/** Keys of the achievements the stats satisfy that are not unlocked yet. */
export function newlyUnlocked(stats: GamificationStats, unlocked: Set<string>): AchievementDef[] {
  return ACHIEVEMENTS.filter((achievement) => !unlocked.has(achievement.key) && isUnlocked(achievement, stats));
}

/** The longest run of consecutive calendar days (YYYY-MM-DD, any order). */
export function longestStreak(dates: string[]): number {
  const sorted = [...new Set(dates)].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of sorted) {
    const next = previous ? new Date(`${previous}T00:00:00Z`).getTime() + 86_400_000 === new Date(`${date}T00:00:00Z`).getTime() : false;
    run = next ? run + 1 : 1;
    best = Math.max(best, run);
    previous = date;
  }
  return best;
}
