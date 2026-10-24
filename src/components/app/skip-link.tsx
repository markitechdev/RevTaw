/** "Skip to content": the first stop for keyboard users on every layout, shown only while focused. */
export function SkipLink({ target = "main-content" }: { target?: string }) {
  return (
    <a
      href={`#${target}`}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow"
    >
      Skip to content
    </a>
  );
}
