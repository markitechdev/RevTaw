/** Retrieval-practice formats (spec §16 "Retrieval Practice"). Client-safe constants. */
export const RETRIEVAL_FORMATS = ["short_answer", "definition", "fill_blank", "explanation", "list", "example", "process", "calculation"] as const;
export type RetrievalFormat = (typeof RETRIEVAL_FORMATS)[number];
export const RETRIEVAL_FORMAT_LABEL: Record<RetrievalFormat, string> = {
  short_answer: "Short answer",
  definition: "Definition",
  fill_blank: "Fill in the blank",
  explanation: "Explanation",
  list: "List",
  example: "Example",
  process: "Process",
  calculation: "Calculation",
};
