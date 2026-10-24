/**
 * Turns off zod's eval-based fast path in the browser without loading zod.
 *
 * RevTaw's Content Security Policy has no 'unsafe-eval', so zod can't compile
 * parsers with `new Function` there anyway. Left on, zod still probes for it
 * on the first parse, and the browser reports that probe as a CSP violation
 * even though zod catches the error. zod keeps its settings on this global
 * (shared by every copy of zod on the page), so setting it here works whether
 * zod has loaded yet or not, and costs no download. Client-safe.
 */
type ZodScope = typeof globalThis & { __zod_globalConfig?: { jitless?: boolean } };

export function makeZodJitless(): void {
  const scope = globalThis as ZodScope;
  (scope.__zod_globalConfig ??= {}).jitless = true;
}
