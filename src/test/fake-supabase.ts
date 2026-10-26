/**
 * An in-memory stand-in for the Supabase query builder, for tests of services that read and write a few
 * tables. It knows select, update, delete and upsert, with eq, neq, is, in, not (is / eq), contains (a JSON column
 * holding the given keys), order, limit and range, then awaiting the query, maybeSingle or single. Rows are
 * plain objects and come back whole: give them the columns, aliases and embedded rows the code reads.
 * Every finished query is logged with its filters, so a test can check that a read was limited to the
 * student's own rows.
 */

type Row = Record<string, unknown>;
type Filter = { op: "eq" | "neq" | "is" | "in" | "not.is" | "not.eq" | "contains"; column: string; value: unknown };
export type LoggedQuery = { table: string; action: "select" | "update" | "delete" | "insert" | "upsert"; filters: Filter[]; values?: Row };

function matches(row: Row, filter: Filter): boolean {
  const cell = row[filter.column];
  switch (filter.op) {
    case "eq":
    case "is":
      return (cell ?? null) === filter.value;
    case "neq":
    case "not.eq":
    case "not.is":
      return (cell ?? null) !== filter.value;
    case "in":
      return (filter.value as unknown[]).includes(cell);
    case "contains": {
      const json = (cell ?? {}) as Row;
      return Object.entries(filter.value as Row).every(([key, value]) => json[key] === value);
    }
  }
}

export function fakeSupabase(tables: Record<string, Row[]>) {
  const log: LoggedQuery[] = [];

  function query(table: string, action: LoggedQuery["action"], values?: Row) {
    const filters: Filter[] = [];
    let order: { column: string; ascending: boolean } | null = null;
    let limit: number | null = null;
    let range: [number, number] | null = null;

    const run = (): { data: Row[]; error: null } => {
      const rows = (tables[table] ??= []);
      log.push({ table, action, filters: [...filters], ...(values ? { values } : {}) });
      if (action === "insert") {
        const inserted = { id: `${table}-${rows.length + 1}`, ...values };
        rows.push(inserted);
        return { data: [inserted], error: null };
      }
      let hit = rows.filter((row) => filters.every((filter) => matches(row, filter)));
      if (action === "update") for (const row of hit) Object.assign(row, values);
      if (action === "delete") tables[table] = rows.filter((row) => !hit.includes(row));
      if (order) {
        const { column, ascending } = order;
        hit = [...hit].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : String(a[column]) > String(b[column]) ? 1 : 0) * (ascending ? 1 : -1));
      }
      if (range) hit = hit.slice(range[0], range[1] + 1);
      if (limit !== null) hit = hit.slice(0, limit);
      return { data: hit, error: null };
    };

    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => (filters.push({ op: "eq", column, value }), chain),
      neq: (column: string, value: unknown) => (filters.push({ op: "neq", column, value }), chain),
      is: (column: string, value: unknown) => (filters.push({ op: "is", column, value }), chain),
      in: (column: string, value: unknown[]) => (filters.push({ op: "in", column, value }), chain),
      not: (column: string, op: "is" | "eq", value: unknown) => (filters.push({ op: `not.${op}`, column, value: value === "null" ? null : value }), chain),
      contains: (column: string, value: Row) => (filters.push({ op: "contains", column, value }), chain),
      order: (column: string, options?: { ascending?: boolean }) => ((order ??= { column, ascending: options?.ascending ?? true }), chain),
      limit: (count: number) => ((limit = count), chain),
      range: (from: number, to: number) => ((range = [from, to]), chain),
      maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
      single: async () => {
        const row = run().data[0];
        return row ? { data: row, error: null } : { data: null, error: { message: "no rows" } };
      },
      then: <T>(resolve: (value: { data: Row[]; error: null }) => T, reject?: (reason: unknown) => T) => Promise.resolve().then(run).then(resolve, reject),
    };
    return chain;
  }

  /** An upsert of one or more rows on the onConflict columns (ignoreDuplicates leaves a row that exists alone). */
  function upsert(table: string, values: Row | Row[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    const run = (): { data: Row[]; error: null } => {
      const rows = (tables[table] ??= []);
      const keys = (options.onConflict ?? "id").split(",").map((key) => key.trim());
      const written: Row[] = [];
      for (const value of Array.isArray(values) ? values : [values]) {
        log.push({ table, action: "upsert", filters: [], values: value });
        const existing = rows.find((row) => keys.every((key) => row[key] === value[key]));
        if (existing) {
          if (!options.ignoreDuplicates) written.push(Object.assign(existing, value));
          continue;
        }
        const inserted = { id: `${table}-${rows.length + 1}`, ...value };
        rows.push(inserted);
        written.push(inserted);
      }
      return { data: written, error: null };
    };
    return { then: <T>(resolve: (value: { data: Row[]; error: null }) => T, reject?: (reason: unknown) => T) => Promise.resolve().then(run).then(resolve, reject) };
  }

  const client = {
    from: (table: string) => ({
      select: () => query(table, "select"),
      update: (values: Row) => query(table, "update", values),
      delete: () => query(table, "delete"),
      insert: (values: Row) => query(table, "insert", values),
      upsert: (values: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) => upsert(table, values, options),
    }),
  };
  return { client: client as never, tables, log };
}
