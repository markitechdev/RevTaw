/**
 * Removes a one-shot query parameter (?upload=1, ?create=1, ?exam=new) from the
 * address bar once its dialog closes, so a reload does not reopen it.
 */
export function clearQueryParam(name: string): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(name)) return;
  url.searchParams.delete(name);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}
