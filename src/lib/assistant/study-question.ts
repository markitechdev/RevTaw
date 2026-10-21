/**
 * Whether a question needs the student's own study data to answer ("what
 * topics am I weak at?", "ano ang dapat kong aralin ngayon?", "how is my
 * exam prep going?"). Only then does Tamari's request carry a study snapshot,
 * so ordinary questions stay small. Pure and client-safe.
 */
const STUDY_DATA = [
  /\b(weak(est)?|struggl\w*|nahihirapan|mahina)\b/,
  /\bwhat (should|do|can) i (study|review|focus on|work on|do)( first| next| today| now)?\b/,
  /\b(ano(ng)?|ano ang) (ba )?(dapat|pwede|kailangan)? ?(kong |ko |kung )?(aralin|aaralin|i ?review|ireview|gawin|unahin)\b/,
  /\b(study|review|aral) (plan|today|tonight|now|ngayon|mamaya)\b/,
  /\b(my|ko|aking|kong) (mistakes?|mali|exams?|plan|schedule|progress|mastery|streak|scores?|grades?|reviews?)\b/,
  /\b(mistake notebook|due today|next exam|upcoming exams?|exam prep|ready for (my|the) exam)\b/,
];

export function asksAboutStudyData(message: string): boolean {
  const text = message
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ");
  return STUDY_DATA.some((pattern) => pattern.test(text));
}
