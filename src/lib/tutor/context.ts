/**
 * Picks the material passages most relevant to a question so the tutor
 * prompt stays within budget while staying grounded (spec §13, §46). The
 * ranking comes from hybrid search in Postgres when it is available
 * (src/lib/search/hybrid.ts); otherwise from the keyword scoring below,
 * which runs anywhere and is testable.
 */

export type ContextChunk = {
  id: string;
  position: number;
  heading: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  content: string;
  /** In a chat across all the student's materials: the passage's material, and its number in this turn. */
  materialId?: string;
  materialTitle?: string;
  ref?: number;
};

const STOPWORDS = new Set(
  "the a an and or but of to in on at for with from by as is are was were be been being it its this that these those what which who whom whose why how when where does do did can could should would will shall may might must about into over under between through during before after above below up down out off again further then once here there all any both each few more most other some such no nor not only own same so than too very just also me my i you your we our they their he she his her them us".split(
    " ",
  ),
);

/** Common Filipino function words, so "Ano ang ginagawa ng chlorophyll?" searches for "ginagawa" and "chlorophyll". */
export const FILIPINO_STOPWORDS = new Set(
  (
    "ang ng nang mga sa na at ay si ni kay sina nina kina ko mo niya namin natin ninyo nila ako ikaw siya kami tayo kayo sila " +
    "ito iyan iyon yan yun yung ung dito diyan doon ano sino saan kailan bakit paano ilan alin po opo naman lang lamang din rin " +
    "pa ba kasi kung para pag kapag nga hindi oo wala may mayroon meron isang isa pero kaya daw raw muna pala sana diba " +
    "ganito ganyan ganoon iba lahat bawat tungkol gaya tulad mula hanggang habang dahil upang nito niyan noon ngayon ating " +
    "aming kanilang kaniyang kanyang iyong aking ninyong sakin sayo samin satin ganun talaga parang mas pinaka"
  ).split(" "),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .match(/[\p{L}\p{N}][\p{L}\p{N}'-]{1,}/gu)
    ?.filter((word) => word.length > 2 && !STOPWORDS.has(word)) ?? [];
}

function stem(word: string): string {
  return word.replace(/(ies|es|s|ing|ed)$/u, "");
}

/** The words of a query to score passages by: content words, stemmed, once each. */
export function focusTerms(text: string): string[] {
  return [...new Set(tokenize(text).map(stem))];
}

export function scoreChunk(chunk: Pick<ContextChunk, "heading" | "content">, queryTerms: string[]): number {
  if (queryTerms.length === 0) return 0;
  const words = tokenize(chunk.content).map(stem);
  if (words.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const word of words) counts.set(word, (counts.get(word) ?? 0) + 1);
  const headingWords = new Set(tokenize(chunk.heading ?? "").map(stem));
  let score = 0;
  for (const term of queryTerms) {
    const hits = counts.get(term) ?? 0;
    if (hits > 0) score += 1 + Math.log(1 + hits);
    if (headingWords.has(term)) score += 2;
  }
  // Mild length normalization so a giant chunk does not win by volume alone.
  return score / Math.sqrt(1 + words.length / 400);
}

export type SelectedContext = {
  chunks: ContextChunk[];
  totalChunks: number;
  truncated: boolean;
};

/**
 * Returns the chunks to send: the chunk containing the selection first,
 * then the best-ranked chunks for the query (`ranked`, chunk ids from hybrid
 * search, or keyword scores without it), filled up to `budgetChars`,
 * finally re-ordered by position so the transcript reads naturally.
 * With no query terms (e.g. "summarize the material"), it takes chunks in
 * order from the top.
 */
export function selectContext(chunks: ContextChunk[], query: string, selection: string | null, budgetChars = 14_000, ranked: string[] | null = null): SelectedContext {
  const terms = focusTerms(`${query} ${selection ?? ""}`);
  const picked = new Map<string, ContextChunk>();
  let used = 0;

  const take = (chunk: ContextChunk) => {
    if (picked.has(chunk.id)) return true;
    if (used + chunk.content.length > budgetChars && picked.size > 0) return false;
    picked.set(chunk.id, chunk);
    used += chunk.content.length;
    return true;
  };

  if (selection) {
    const needle = selection.replace(/\s+/g, " ").trim().slice(0, 120).toLowerCase();
    const holder = chunks.find((chunk) => chunk.content.replace(/\s+/g, " ").toLowerCase().includes(needle));
    if (holder) take(holder);
  }

  const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const fromSearch = (ranked ?? []).map((id) => byId.get(id)).filter((chunk): chunk is ContextChunk => chunk !== undefined);
  const best = fromSearch.length
    ? fromSearch
    : terms.length
      ? chunks
          .map((chunk) => ({ chunk, score: scoreChunk(chunk, terms) }))
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score || a.chunk.position - b.chunk.position)
          .map((entry) => entry.chunk)
      : [];

  for (const chunk of best) if (!take(chunk)) break;
  // Fill remaining budget in reading order so short materials are sent whole.
  for (const chunk of chunks) {
    if (used >= budgetChars) break;
    if (!take(chunk)) break;
  }

  const ordered = [...picked.values()].sort((a, b) => a.position - b.position);
  return { chunks: ordered, totalChunks: chunks.length, truncated: ordered.length < chunks.length };
}

export function labelChunk(chunk: ContextChunk): string {
  const pages = chunk.pageStart ? (chunk.pageEnd && chunk.pageEnd !== chunk.pageStart ? `pages ${chunk.pageStart}-${chunk.pageEnd}` : `page ${chunk.pageStart}`) : null;
  // Across materials, positions repeat, so each passage gets its own number and names its material.
  if (chunk.ref !== undefined) {
    const title = (chunk.materialTitle ?? "material").replace(/"/g, "'");
    return `[Passage ${chunk.ref} — "${title}"${chunk.heading ? `, ${chunk.heading}` : ""}${pages ? `, ${pages}` : ""}]`;
  }
  return `[Section ${chunk.position}${chunk.heading ? `: ${chunk.heading}` : ""}${pages ? `, ${pages}` : ""}]`;
}

/**
 * The part of a long passage that matters for a question, at most `maxChars`: the paragraph with the most
 * topic words and its neighbors (a window around the first one when a single paragraph is that long), or
 * the start when nothing matches. "…" marks what was left out.
 */
export function excerpt(content: string, query: string, maxChars: number): string {
  const text = content.trim();
  if (text.length <= maxChars) return text;
  const terms = topicWords(query);
  const paragraphs = text.split(/\n{2,}/);
  const hits = paragraphs.map((paragraph) => {
    const words = new Set(tokenize(paragraph).map(stem));
    return terms.filter((term) => words.has(term)).length;
  });
  const best = hits.indexOf(Math.max(...hits));
  // Room for the "… " and " …" marks.
  const room = maxChars - 4;
  let start = best;
  let end = best;
  let length = paragraphs[best].length;
  // Grow toward the shorter neighbor (the following one on a tie) while it fits.
  while (true) {
    const next = end + 1 < paragraphs.length ? paragraphs[end + 1].length + 2 : Infinity;
    const previous = start > 0 ? paragraphs[start - 1].length + 2 : Infinity;
    if (next <= previous && length + next <= room) {
      end += 1;
      length += next;
    } else if (previous < next && length + previous <= room) {
      start -= 1;
      length += previous;
    } else break;
  }
  const before = start > 0;
  const after = end < paragraphs.length - 1;
  const body = paragraphs.slice(start, end + 1).join("\n\n");
  if (body.length <= room) return `${before ? "… " : ""}${body}${after ? " …" : ""}`;
  // One paragraph longer than that: a window around its first topic word.
  const lower = body.toLowerCase();
  const first = Math.min(...terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0));
  const size = maxChars - 2;
  const from = Math.max(0, Math.min((Number.isFinite(first) ? first : 0) - Math.floor(maxChars / 3), body.length - size));
  return `${before || from > 0 ? "…" : ""}${body.slice(from, from + size).trim()}${after || from + size < body.length ? "…" : ""}`;
}

/** Greetings, thanks and the like: nothing to look up in the student's materials. */
const SMALL_TALK = new Set(
  "hello hey hiya thanks thank thankyou salamat maraming okay okey sige noted yes yep nope opo hindi bye goodbye good morning afternoon evening night kumusta kamusta musta tamari revtaw nice cool great wow haha hehe lol".split(" "),
);

/** Whether a message is worth searching the student's materials for: it has a word that isn't small talk. */
export function searchableQuestion(text: string): boolean {
  return tokenize(text).some((word) => !SMALL_TALK.has(word) && !/^(ha)+$|^(he)+$/.test(word));
}

/**
 * Words that ask for something or point at the student's files rather than name a topic. Kept short on
 * purpose: a word that can be a topic ("mean", "simple", "difference") stays a topic word.
 */
const ASKING_WORDS = new Set(
  "explain explaining explanation define definition meaning example examples describe tell give show please pls help summarize summarise notes note material materials reviewer reviewers module modules lesson lessons ipaliwanag pakipaliwanag paliwanag ibig sabihin kahulugan halimbawa ibigay bigyan pakibigay gusto pwede puwede paki".split(
    " ",
  ),
);

/** The words of a question that name its topic (stemmed): no stopwords in English or Filipino, small talk or asking words. */
export function topicWords(text: string): string[] {
  const words = tokenize(text).filter((word) => !FILIPINO_STOPWORDS.has(word) && !SMALL_TALK.has(word) && !ASKING_WORDS.has(word));
  return [...new Set(words.map(stem))];
}

/** Whether a passage (with its heading and material title) shares a topic word with the question. */
export function sharesTopic(terms: string[], text: string): boolean {
  if (terms.length === 0) return false;
  const words = new Set(tokenize(text).map(stem));
  return terms.some((term) => words.has(term));
}

const FILES = "notes?|materials?|reviewers?|modules?|handouts?|lessons?|lectures?|slides?|files?|uploads?|pdfs?|readings?|textbooks?|books?|aralin|libro";
const ABOUT_NOTES = new RegExp(
  [
    `\\b(?:my|our)\\s+(?:[\\p{L}\\p{N}'-]+\\s+){0,2}(?:${FILES})\\b`, // my notes, my Biology reviewer
    "\\b(?:the|sa|yung|ung|iyong)\\s+(?:notes?|materials?|reviewers?|modules?|handouts?|slides?|pdfs?|aralin)\\b", // the module, sa notes
    `\\b(?:${FILES})\\s+(?:ko|namin|natin)\\b`, // notes ko, module namin
    "\\b(?:uploaded|inupload|in-upload|na-upload|naupload)\\b", // the PDF I uploaded, yung inupload ko
  ].join("|"),
  "iu",
);

/** Whether the student asks about their own materials ("what do my notes say…", "sa reviewer ko"): then any match is worth showing. */
export function asksAboutNotes(text: string): boolean {
  return ABOUT_NOTES.test(text.normalize("NFKC"));
}

/** What to search the material for: a follow-up ("give me an example") carries the topic of the answer it is about. */
export function retrievalQuery(message: string, focus: { question: string | null; answer: string } | null, lastQuestion: string | null): string {
  if (focus) return `${message} ${focus.question ?? ""} ${focus.answer.slice(0, 400)}`.trim();
  // A short follow-up ("why does that happen?") is about the previous question.
  if (lastQuestion && message.trim().length < 60) return `${message} ${lastQuestion.slice(0, 400)}`;
  return message;
}
