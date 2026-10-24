import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Keeps zod out of the JavaScript the browser downloads up front. Zod is the
 * server's validator; in the browser it cost every signed-in page about 30 KB
 * (gzip) just for option lists that lived next to the schemas. This walks
 * every static import from each client entry ("use client" files and
 * instrumentation-client.ts) and fails if any of them reaches zod. Type-only
 * imports are erased, Server Action modules ("use server") are called over
 * the network rather than bundled, and `import()` loads on demand, so none of
 * those count.
 */

const SRC = fileURLToPath(new URL("..", import.meta.url));
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

type ModuleInfo = { directive: "use client" | "use server" | null; local: string[]; packages: string[] };

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.(test|d)\.ts$/.test(entry.name) ? [full] : [];
  });
}

function resolveLocal(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/") ? path.join(SRC, specifier.slice(2)) : path.resolve(path.dirname(from), specifier);
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const extension of EXTENSIONS) if (fs.existsSync(base + extension)) return base + extension;
  return null;
}

function isTypeOnlyImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return false; // a side-effect import runs
  if (clause.isTypeOnly) return true;
  if (clause.name) return false;
  const bindings = clause.namedBindings;
  return Boolean(bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly));
}

function isTypeOnlyExport(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return true;
  const clause = node.exportClause;
  return Boolean(clause && ts.isNamedExports(clause) && clause.elements.length > 0 && clause.elements.every((element) => element.isTypeOnly));
}

const cache = new Map<string, ModuleInfo>();

function moduleInfo(file: string): ModuleInfo {
  const known = cache.get(file);
  if (known) return known;
  const text = fs.readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let directive: ModuleInfo["directive"] = null;
  for (const statement of source.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break;
    if (statement.expression.text === "use client" || statement.expression.text === "use server") directive = statement.expression.text;
  }
  const info: ModuleInfo = { directive, local: [], packages: [] };
  for (const statement of source.statements) {
    let specifier: string | null = null;
    if (ts.isImportDeclaration(statement) && !isTypeOnlyImport(statement)) specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && !isTypeOnlyExport(statement)) specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
    if (!specifier) continue;
    if (specifier.startsWith("@/") || specifier.startsWith(".")) {
      const resolved = resolveLocal(file, specifier);
      if (resolved && /\.(ts|tsx)$/.test(resolved)) info.local.push(resolved);
    } else {
      info.packages.push(specifier);
    }
  }
  cache.set(file, info);
  return info;
}

/** The import chain from `entry` to a module that imports zod, or null. */
function chainToZod(entry: string): string[] | null {
  const seen = new Set<string>();
  const walk = (file: string, trail: string[]): string[] | null => {
    if (seen.has(file)) return null;
    seen.add(file);
    const info = moduleInfo(file);
    // A Server Action module is a network call from the browser; its imports stay on the server.
    if (trail.length > 0 && info.directive === "use server") return null;
    const here = [...trail, path.relative(SRC, file)];
    if (info.packages.some((name) => name === "zod" || name.startsWith("zod/"))) return here;
    for (const next of info.local) {
      const found = walk(next, here);
      if (found) return found;
    }
    return null;
  };
  return walk(entry, []);
}

describe("browser bundles", () => {
  const files = sourceFiles(SRC);
  const entries = [...files.filter((file) => moduleInfo(file).directive === "use client"), path.join(SRC, "instrumentation-client.ts")];

  it("finds the client entries", () => {
    // Guards the walk itself: a broken parser would find nothing and pass.
    expect(entries.length).toBeGreaterThan(100);
    expect(chainToZod(path.join(SRC, "lib/preferences/schema.ts"))).toEqual(["lib/preferences/schema.ts"]);
  });

  it("never import zod up front", () => {
    const offenders = entries.map(chainToZod).filter((chain): chain is string[] => chain !== null).map((chain) => chain.join(" -> "));
    expect(offenders).toEqual([]);
  });
});
