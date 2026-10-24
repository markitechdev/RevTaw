/**
 * Compile-time check that two types match, for the hand-written types that
 * mirror a zod schema. Those types live in zod-free modules so the browser
 * never downloads zod; `assertSameType<A, B>()` does nothing at run time and
 * fails type checking (it then wants an argument) as soon as the type and its
 * schema drift apart: a field added, removed, renamed or retyped on one side.
 */
export type SameType<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

export function assertSameType<A, B>(...proof: SameType<A, B> extends true ? [] : [never]): void {
  void proof;
}
