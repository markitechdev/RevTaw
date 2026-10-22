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
};

const STOPWORDS = new Set(
  "the a an and or but of to in on at for with from by as is are was were be been being it its this that these those what which who whom whose why how when where does do did can could should would will shall may might must about into over under between through during before after above below up down out off again further then once here there all any both each few more most other some such no nor not only own same so than too very just also me my i you your we our they their he she his her them us".split(
    " ",
  ),
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

export function scoreChunk(chunk: ContextChunk, queryTerms: string[]): number {
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
  // Mild length normalisation so a giant chunk does not win by volume alone.
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
  const terms = [...new Set(tokenize(`${query} ${selection ?? ""}`).map(stem))];
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
  return `[Section ${chunk.position}${chunk.heading ? `: ${chunk.heading}` : ""}${pages ? `, ${pages}` : ""}]`;
}
