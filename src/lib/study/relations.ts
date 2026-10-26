import { tidyText } from "@/lib/quizzes/text-match";

/**
 * Relationship wordings that say the same thing about a link from one concept to another, so naming a link
 * with a synonym of the material's wording counts ("causes" for "leads to"). Only same-direction synonyms
 * are grouped: "is part of" is not "contains", and "requires" is not "is required for". Pure and client-safe.
 */
const RELATION_GROUPS: ReadonlyArray<readonly string[]> = [
  ["causes", "leads to", "results in", "brings about", "triggers", "gives rise to"],
  ["requires", "depends on", "needs", "relies on"],
  ["contains", "includes", "consists of", "is made of", "is made up of", "is composed of"],
  ["is part of", "belongs to", "is a part of", "is a component of"],
  ["is an example of", "is a type of", "is a kind of", "is a form of"],
  ["produces", "makes", "forms", "creates", "generates"],
  ["converts to", "converts into", "turns into", "becomes", "changes into"],
  ["inhibits", "blocks", "prevents", "stops"],
  ["increases", "raises", "boosts"],
  ["decreases", "lowers", "reduces"],
];

const GROUP_OF = new Map<string, number>(RELATION_GROUPS.flatMap((group, index) => group.map((wording) => [tidyText(wording), index] as const)));

/** What a relationship wording means: its synonym group, or the wording itself when it has none. */
export function relationKey(wording: string): string {
  const tidy = tidyText(wording);
  const group = GROUP_OF.get(tidy);
  return group === undefined ? tidy : `group:${group}`;
}

/** Whether two wordings name the same relationship. */
export function sameRelation(a: string, b: string): boolean {
  const key = relationKey(a);
  return key !== "" && key === relationKey(b);
}
