/** P1380: the event-link reply's `to` must be an app path; anything else is refused (no open redirect). */
export function safeAppPath(to: unknown): string | null {
  if (typeof to !== 'string' || !to.startsWith('/') || to.startsWith('//') || to.includes('\\')) return null;
  return to;
}
