/**
 * @file sentry-replay-guard.ts
 * @description P1515: Sentry Replay must not record a page load that carried a canvas link token.
 *
 * main.tsx keeps replaysOnErrorSampleRate at 1.0, which BUFFERS the page from Sentry.init and uploads the buffer
 * when any error happens. The buffer starts with the URL the page had at init. index.html's first script now takes
 * the token out of the address before Sentry.init runs (and sets `window.__canvasLinkTokenLoad`), so the buffer should
 * never see it; the integration is still not added on such a load, as a second layer, and for a load where the head
 * script did not run. Decided before Sentry.init: the integration cannot record what it never started.
 *
 * P1692: the same for a load whose address carries the `token` parameter (the access value of a letter link or an
 * agreement invitation). DEPENDENCY-FREE and pattern-free on purpose: the decision parses the query. It never runs
 * the redaction pattern, which is global and so keeps state between `.test()` calls.
 */

function hasTokenParameter(query: string): boolean {
  try {
    return new URLSearchParams(query || '').has('token');
  } catch {
    return false;
  }
}

/** The query of the address that the parameter `name` of `query` holds, or '' when there is none. */
function carriedQuery(query: string, name: string): string {
  try {
    const address = new URLSearchParams(query || '').get(name) || '';
    const at = address.indexOf('?');
    return at === -1 ? '' : address.slice(at + 1).split('#')[0] ?? '';
  } catch {
    return '';
  }
}

/**
 * True when this load's address carries the `token` parameter: in its own query, or, on the sign-in pages (sign-in,
 * sign-up and the two sign-in landing pages), in the address the person is sent back to. That address rides in
 * `redirect`; an emailed sign-in link wraps it once more, in `redirect_to`. No other parameter is considered here;
 * index.html holds the same rule for Mixpanel, and a test asserts the two agree.
 */
export function loadCarriesAccessToken(pathname: string, search: string): boolean {
  if (hasTokenParameter(search)) return true;
  if (!/^\/(?:login|signup|auth\/(?:verify|callback))(?:\/|$)/i.test(pathname || '')) return false;
  return hasTokenParameter(carriedQuery(search, 'redirect')) || hasTokenParameter(carriedQuery(carriedQuery(search, 'redirect_to'), 'redirect'));
}

export function shouldStartReplay(pathname: string, search: string, hash = '', tokenLoad = false): boolean {
  if (tokenLoad) return false; // the head script took a token out of this load's address
  if (loadCarriesAccessToken(pathname, search)) return false;
  const canvasAddress = /^\/p\/[^/]+\/canvas\/[^/]+/i.test(pathname);
  const carriesToken = new URLSearchParams(search || '').has('k') || new URLSearchParams((hash || '').replace(/^#/, '')).has('k');
  return !(canvasAddress && carriesToken);
}
