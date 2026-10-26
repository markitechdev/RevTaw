/**
 * Text helpers shared by the mock provider's heuristics: transcript sections,
 * sentences, keywords and the definition-style "facts" most heuristics build on.
 */

/** Splits a RevTaw transcript into its labeled sections. */
export function parseTranscriptSections(transcript: string): Array<{ heading: string; text: string }> {
  const sections: Array<{ heading: string; text: string }> = [];
  let current: { heading: string; text: string[] } | null = null;
  for (const line of transcript.split("\n")) {
    // "[Section: Heading, pages 2-3]", or "[Section 4, page 2]" for a section without a heading.
    const label = line.match(/^\[Section(?::\s*(.+?)|\s+(\d+))?(?:,\s*pages?\s[^\]]+)?\]$/);
    if (label) {
      if (current) sections.push({ heading: current.heading, text: current.text.join("\n").trim() });
      current = { heading: (label[1] ?? `Section ${label[2] ?? sections.length + 1}`).trim(), text: [] };
      continue;
    }
    if (/^\[(?:Not included|Skipped here)/.test(line)) continue;
    if (!current) current = { heading: "Overview", text: [] };
    current.text.push(line);
  }
  if (current) sections.push({ heading: current.heading, text: current.text.join("\n").trim() });
  // Chunks keep their heading as the first line; drop it so it does not glue onto the first sentence.
  return sections
    .map((section) => ({
      heading: section.heading,
      text: section.text.replace(new RegExp(`^${section.heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n`, "i"), "").trim(),
    }))
    .filter((section) => section.text.length > 0);
}

export function sentencesOf(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 15);
}

export type MockFact = { term: string | null; definition: string | null; sentence: string; heading: string; next: string | null };

export function stripArticle(term: string): string {
  return term.replace(/^(the|a|an)\s+/i, "").trim();
}

export function keywordsOf(text: string): string[] {
  return [...new Set(text.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) ?? [])].filter(
    (word) => !/^(this|that|with|from|which|their|there|these|those|than|then|into|also|been|have|were|what|when|where|about|other|some|such|more|most|only|very|will|would|could|should|because|while|after|before|between|through|under|over|each|every)$/.test(word),
  );
}

export function isHeadingLike(line: string): boolean {
  return line.length <= 60 && !/[.!?:;,]$/.test(line) && /^[A-Z0-9]/.test(line) && line.split(" ").length <= 6;
}

export function collectFacts(transcript: string): MockFact[] {
  const sections = parseTranscriptSections(transcript);
  const facts: MockFact[] = [];
  for (const section of sections) {
    // Inline headings inside a merged chunk would glue onto the next sentence; drop them.
    const body = section.text
      .split("\n")
      .filter((line) => !isHeadingLike(line.trim()))
      .join("\n");
    const sentences = sentencesOf(body).filter((sentence) => sentence.length <= 240);
    sentences.forEach((sentence, index) => {
      const match = sentence.match(/^((?:[A-Z][\w'-]*|[a-z][\w'-]*)(?:\s+[\w'-]+){0,4}?)\s+(?:is|are|refers to|means|is defined as)\s+(.+?)[.!?]?$/);
      facts.push({
        term: match ? stripArticle(match[1]) : null,
        definition: match ? match[2].trim() : null,
        sentence,
        heading: section.heading,
        next: sentences[index + 1] ?? null,
      });
    });
  }
  // Definitions first: they make the best objective questions.
  return [...facts.filter((fact) => fact.term), ...facts.filter((fact) => !fact.term)];
}

export function overlap(expected: string[], given: string): { hits: string[]; misses: string[]; ratio: number } {
  const words = new Set(keywordsOf(given));
  const hits = expected.filter((word) => words.has(word));
  const misses = expected.filter((word) => !words.has(word));
  return { hits, misses, ratio: expected.length ? hits.length / expected.length : 0 };
}

/** Transcript sections split again at inline headings, so short notes still give several sections. */
export function splitInlineSections(transcript: string): Array<{ heading: string; text: string }> {
  return parseTranscriptSections(transcript)
    .flatMap((section) => {
      const parts: Array<{ heading: string; text: string }> = [];
      let current = { heading: section.heading, lines: [] as string[] };
      for (const line of section.text.split("\n")) {
        if (isHeadingLike(line.trim())) {
          if (current.lines.join(" ").trim()) parts.push({ heading: current.heading, text: current.lines.join("\n").trim() });
          current = { heading: line.trim(), lines: [] };
          continue;
        }
        current.lines.push(line);
      }
      if (current.lines.join(" ").trim()) parts.push({ heading: current.heading, text: current.lines.join("\n").trim() });
      return parts;
    })
    .filter((section) => sentencesOf(section.text).length > 0);
}
