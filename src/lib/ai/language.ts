/**
 * Which language a student's message is written in, read from its everyday function words: English ("the",
 * "is", "what") and Filipino ("ang", "ng", "mga", "ba", "po"). It backs the Auto language setting ("Answer in
 * the language I write in") with a plain fact for the prompt ("the message is in English"), because a model
 * reading Tamari's Filipino-flavored instructions can drift into Filipino for an English question.
 *
 * Only English is ever stated: a message with any Filipino word (Filipino, Taglish, or a language that shares
 * those words, such as Cebuano) gets the general "reply in the language the student writes in" rule, so a
 * miscount can never push a student into English. Words common to both ("may", "at", "o"), shared slang
 * ("gets", "ok") and code are not counted.
 */

const ENGLISH = new Set(
  (
    "the a an is are was were be been being am i i'm im i've i'd i'll me my mine you your yours you're you've we our us they them their " +
    "he him his she her it it's its this that these those there here what what's why how when where which who whose whom " +
    "do does did don't doesn't didn't can can't cannot could couldn't would wouldn't should shouldn't will won't shall must might " +
    "have has had haven't hasn't of in on to for with from by about into than then and or but not so if because also just very really " +
    "too more most much many some any every all please explain tell give show help hello hi hey thanks thank yes know mean understand"
  ).split(" "),
);

const FILIPINO = new Set(
  (
    "ang ng nang mga sa si ni kay kina nina sina na pa ba po opo oo hindi di 'di wala walang meron mayroon lang lamang din rin daw raw " +
    "nga naman kasi kase pero kaya sana siguro baka dapat para kung kapag pag habang tapos saka pati ulit muna talaga sobra grabe " +
    "salamat sige ayos tama mali gusto ayaw kailangan pwede puwede pede paki ngayon bukas kahapon mamaya lahat isa dalawa tatlo " +
    "bakit paano pano ano anong anu saan san kailan kelan sino sinong alin aling ilan ilang gaano magkano ganito ganyan ganoon ganun ganon " +
    "eh diba kaso kahit alam intindi aral ay ako ko 'ko ka mo ikaw siya sya sila kami tayo kayo kita niya nya nila namin natin ninyo nyo niyo " +
    "akin sakin saken iyo sayo atin satin amin inyo kanila kaniya kanya ito 'to iyan yan iyon yon yun 'yun yung 'yung ung nito niyan nyan " +
    "niyon noon dito diyan dyan doon mag nag huwag wag 'wag"
  ).split(" "),
);

export type LanguageCounts = { english: number; filipino: number; words: number };

/** How many English and Filipino function words the text has (code left out), and how many words in all. */
export function languageCounts(text: string): LanguageCounts {
  const prose = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .toLowerCase()
    .replace(/[‘’]/g, "'");
  // Letters of any alphabet, so "problème" stays one word instead of ending in an English "me".
  const words = prose.match(/'?\p{L}+(?:'\p{L}+)?/gu) ?? [];
  let english = 0;
  let filipino = 0;
  for (const word of words) {
    // "'to" and "'yung" are Filipino as written; otherwise a leading quote mark is not part of the word.
    const bare = word.replace(/^'/, "");
    if (FILIPINO.has(word) || FILIPINO.has(bare)) filipino += 1;
    else if (ENGLISH.has(bare)) english += 1;
  }
  return { english, filipino, words: words.length };
}

/** Clearly English: at least two English function words and no Filipino ones. */
export function isClearlyEnglish(counts: LanguageCounts): boolean {
  return counts.filipino === 0 && counts.english >= 2;
}

/**
 * The language to state for a reply, from what the student typed: "en" when the message is clearly English,
 * otherwise null (the general rule applies). A message too short to tell ("and right?", "why?") goes by the
 * student's latest messages before it; with none, a short message with an English word counts as English.
 * `earlier` is the student's earlier messages, oldest first, without the app's own quick-action prompts.
 */
export function replyLanguage(message: string | null, earlier: string[]): "en" | null {
  const counts = message ? languageCounts(message) : null;
  if (counts && counts.filipino > 0) return null;
  if (counts && isClearlyEnglish(counts)) return "en";
  for (const turn of earlier.slice(-3).reverse()) {
    const previous = languageCounts(turn);
    if (previous.filipino > 0) return null;
    if (isClearlyEnglish(previous)) return "en";
  }
  return counts && counts.english === 1 && counts.words <= 4 ? "en" : null;
}
