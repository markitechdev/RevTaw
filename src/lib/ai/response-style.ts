import type { AiPreferences } from "@/lib/preferences/schema";

/**
 * Prompt rules from Settings → AI (UI phase §23–§25): the language, tone and
 * depth of conversational answers. Language understanding (speech to text),
 * the model and speech output stay separate layers; this only shapes the
 * model's wording. The student's own words in a message always win.
 *
 * `written` is the language the student's message was found to be in (language.ts), stated for the Auto
 * setting ("Answer in the language I write in") so the reply follows it; only English is ever stated.
 */
export function responseStyleRules(response: AiPreferences | undefined, written: "en" | null = null): string[] {
  if (!response) return [];
  const rules: string[] = [];
  switch (response.language) {
    case "auto":
      rules.push(
        written === "en"
          ? "Language: the student's message is in English, so reply in English. Switch to Filipino (Tagalog), Taglish or another language only when they write in it or ask for it."
          : "Language: reply in the language the student writes in — English, Filipino (Tagalog), Taglish (a natural mix of Filipino and English) or another language — and match their mix.",
      );
      break;
    case "en":
      rules.push("Language: reply in English.");
      break;
    case "fil":
      rules.push("Language: reply in Filipino (Tagalog). Keep the material's technical terms when there is no common Filipino word for them.");
      break;
    case "taglish":
      rules.push("Language: reply in natural Taglish — conversational Filipino mixed with English, the way Filipino students talk. Keep technical terms in English.");
      break;
    case "other":
      rules.push(`Language: reply in ${response.otherLanguage || "the language the student writes in"}.`);
      break;
  }
  rules.push("If the student's message asks for a particular language or style, follow that request for this reply.");
  if (response.style === "friendly") rules.push("Tone: warm and encouraging, like a friendly study buddy; a light touch of humour is fine, never at the student's expense.");
  if (response.style === "concise") rules.push("Tone: short and direct. No filler, no pep talk; get to the point.");
  if (response.style === "formal") rules.push("Tone: precise and academic, still clear.");
  if (response.depth === "simple") rules.push("Depth: simple words, one idea at a time, a tiny example when it helps.");
  if (response.depth === "deep") rules.push("Depth: give the full reasoning, the edge cases and how the idea connects to related concepts.");
  rules.push("Quotes from the material, JSON keys and fixed values stay exactly as they are; only your own wording follows these rules.");
  return rules;
}
