import "server-only";

import { unstable_rethrow } from "next/navigation";

import { pageOf, pageRange, type Page } from "@/lib/pagination";

/**
 * Supabase's Data API returns at most 1,000 rows per request (the project's
 * "Max rows" setting, 1,000 unless changed), whatever `.limit()` asks for.
 * A short page is read as the end of the rows, so the setting must stay at
 * 1,000 or above.
 */
export const API_PAGE = 1000;

type RangeQuery<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Reads a query past the 1,000-row cap, a page at a time, up to `maxRows`
 * (with a newest-first order, a cap keeps the latest rows). `build` makes a
 * fresh query for each range and must order by something stable (a unique
 * column last), or rows can repeat or go missing between pages. Up to 1,000
 * rows this is one request, as before.
 */
export async function readPages<T>(build: RangeQuery<T>, maxRows: number): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < maxRows; from += API_PAGE) {
    const to = Math.min(maxRows, from + API_PAGE) - 1;
    const { data, error } = await build(from, to);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < to - from + 1) break;
  }
  return rows;
}

/**
 * `readPages` for figures a page can show without (streaks, charts, counts):
 * a failed read is logged and gives no rows, as an ignored query error did,
 * instead of failing the page.
 */
export async function readPagesQuietly<T>(label: string, build: RangeQuery<T>, maxRows: number): Promise<T[]> {
  try {
    return await readPages(build, maxRows);
  } catch (error) {
    unstable_rethrow(error);
    console.error(`${label}: read failed`, error instanceof Error ? error.message : error);
    return [];
  }
}

type ListResponse = { data: unknown; error: { message: string } | null; count: number | null; status: number };
type ListQuery = PromiseLike<ListResponse> & { range(from: number, to: number): PromiseLike<ListResponse> };

/**
 * One page of a list. `query(head)` builds the list query (its filters and a
 * stable order) selected with `{ count: "exact" }`, and with `head: true`
 * when asked, so the same filters give both the rows and the total. PostgREST
 * answers a page past the end with 416 and no count; the total is then asked
 * for separately and the page comes back empty with `beyond` set, so the
 * caller can send the student to the last page.
 */
export async function fetchPage<Row>(label: string, query: (head: boolean) => ListQuery, page: number, pageSize: number): Promise<Page<Row>> {
  const [from, to] = pageRange(page, pageSize);
  const result = await query(false).range(from, to);
  if (result.status === 416) {
    const { count, error } = await query(true);
    if (error) console.error(`${label}: count failed`, error.message);
    return pageOf<Row>([], count ?? 0, page, pageSize, true);
  }
  if (result.error) {
    console.error(`${label}: list failed`, result.error.message);
    return pageOf<Row>([], 0, page, pageSize);
  }
  const rows = (Array.isArray(result.data) ? result.data : []) as Row[];
  return pageOf(rows, result.count ?? from + rows.length, page, pageSize);
}
