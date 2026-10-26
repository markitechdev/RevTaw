/**
 * Which part of a material a session works through (blurting, guided reading, chunking). A session used
 * to take the material's first sections every time, so a long material's later chapters were never
 * reached, and the concepts a plan asked about were ignored. Pure and client-safe.
 */

const fold = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Whether a passage mentions a concept by name (case and accents aside); names under three letters never match. */
export function mentions(text: string, concept: string): boolean {
  const name = fold(concept);
  if (name.length < 3) return false;
  const haystack = fold(text);
  const at = haystack.indexOf(name);
  if (at === -1) return false;
  // Whole words only: "cell" is not found in "excellent".
  const before = at === 0 ? "" : haystack[at - 1];
  const after = haystack[at + name.length] ?? "";
  return !/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after);
}

/**
 * Up to `count` sections, as indices into `sections`, in reading order:
 * - with focus concepts (the concepts a plan names): the sections that mention them, then the ones after
 *   the first of those;
 * - otherwise the sections after the last one done in earlier sessions (`done`: their indices), wrapping
 *   round to the start once the material is covered.
 */
export function pickSectionIndices(texts: ReadonlyArray<string>, count: number, options: { focus?: ReadonlyArray<string>; done?: ReadonlySet<number> } = {}): number[] {
  const total = texts.length;
  const take = Math.max(0, Math.min(count, total));
  if (take === 0) return [];
  const focus = (options.focus ?? []).filter((name) => name.trim().length > 0);
  const chosen: number[] = [];
  const add = (index: number) => {
    if (chosen.length < take && !chosen.includes(index)) chosen.push(index);
  };
  let start = 0;
  const matched = focus.length ? texts.flatMap((text, index) => (focus.some((name) => mentions(text, name)) ? [index] : [])) : [];
  if (matched.length > 0) {
    for (const index of matched) add(index);
    start = matched[0];
  } else if (options.done && options.done.size > 0) {
    const last = Math.max(...options.done);
    // All covered: start over.
    start = last + 1 >= total || options.done.size >= total ? 0 : last + 1;
  }
  for (let step = 0; step < total && chosen.length < take; step += 1) add((start + step) % total);
  return chosen.sort((a, b) => a - b).filter((index) => index >= start).concat(chosen.filter((index) => index < start).sort((a, b) => a - b));
}
