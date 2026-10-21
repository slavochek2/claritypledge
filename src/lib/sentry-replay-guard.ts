/**
 * @file sentry-replay-guard.ts
 * @description P1515: Sentry Replay must not record a page load that carried a canvas link token.
 *
 * main.tsx keeps replaysOnErrorSampleRate at 1.0, which BUFFERS the page from Sentry.init and uploads the buffer
 * when any error happens. The buffer starts with the URL the page had at init. index.html's first script now takes
 * the token out of the address before Sentry.init runs (and sets `window.__canvasLinkTokenLoad`), so the buffer should
 * never see it; the integration is still not added on such a load, as a second layer, and for a load where the head
 * script did not run. Decided before Sentry.init: the integration cannot record what it never started.
 */
export function shouldStartReplay(pathname: string, search: string, hash = '', tokenLoad = false): boolean {
  if (tokenLoad) return false; // the head script took a token out of this load's address
  const canvasAddress = /^\/p\/[^/]+\/canvas\/[^/]+/i.test(pathname);
  const carriesToken = new URLSearchParams(search || '').has('k') || new URLSearchParams((hash || '').replace(/^#/, '')).has('k');
  return !(canvasAddress && carriesToken);
}
