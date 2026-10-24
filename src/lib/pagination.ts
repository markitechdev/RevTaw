/**
 * Long lists (materials, notes, quizzes, decks, conversations, mistakes, a
 * material's text) come a page at a time. The page number travels in the
 * URL (`?page=2`), so Back, reload and shared links land on the same page.
 * Client-safe.
 */

/** Cards in the three-column grids: divides evenly into one, two or three columns. */
export const GRID_PAGE_SIZE = 24;
/** Rows in the single-column lists. */
export const LIST_PAGE_SIZE = 20;
/** Sections of a material's extracted text on its Content tab (about 3,000 characters each). */
export const CONTENT_PAGE_SIZE = 12;

export type Page<T> = {
  items: T[];
  /** Every matching row, across all pages. */
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** The page asked for is past the end (the list shrank since the link was made). */
  beyond: boolean;
};

/** The page number from a search param: a whole number from 1 up; anything else is page 1. */
export function parsePage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^[0-9]{1,6}$/.test(raw)) return 1;
  return Math.max(1, Number(raw));
}

/** First and last row (0-based, inclusive) of a page, as PostgREST's range() takes them. */
export function pageRange(page: number, pageSize: number): [number, number] {
  const from = (page - 1) * pageSize;
  return [from, from + pageSize - 1];
}

/** How many pages `total` rows fill; an empty list still has one (empty) page. */
export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function pageOf<T>(items: T[], total: number, page: number, pageSize: number, beyond = false): Page<T> {
  return { items, total, page, pageSize, pageCount: pageCountOf(total, pageSize), beyond };
}

/** Which page a 0-based row (a section's position) is on. */
export function pageOfIndex(index: number, pageSize: number): number {
  return Math.floor(Math.max(0, index) / pageSize) + 1;
}

/** The same URL with another page: page 1 drops the parameter, so the first page keeps its plain address. */
export function withPage(path: string, params: URLSearchParams | Record<string, string | null | undefined>, page: number, key = "page"): string {
  const query = new URLSearchParams();
  const entries = params instanceof URLSearchParams ? [...params.entries()] : Object.entries(params);
  for (const [name, value] of entries) if (name !== key && value) query.set(name, value);
  if (page > 1) query.set(key, String(page));
  const string = query.toString();
  return string ? `${path}?${string}` : path;
}
