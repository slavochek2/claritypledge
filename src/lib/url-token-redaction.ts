/**
 * @file url-token-redaction.ts
 * @description The URL-token redaction patterns shared by the browser (Sentry hooks, src/lib/sentry-filters.ts),
 * the Mixpanel block of index.html (an identical copy; a test asserts they stay identical) and the CSP report
 * proxy (api/csp-report.ts). DEPENDENCY-FREE on purpose: the serverless function imports it, and must not pull
 * in the Sentry browser SDK.
 */

/**
 * P1304: the /live and /transcribe room code is a bearer capability — knowing it joins the room. It rides in page
 * URLs (`/live/<code>`), navigation breadcrumbs, transaction names and encoded login redirects
 * (`%2Ftranscribe%2F<code>`). This REDACTS a known token shape; it never drops an event.
 * P1556 adds `/connect/<token>`: a personal contact code, which starts a chat with its owner.
 */
export const ROOM_CODE_IN_URL =/((?:\/|%2F)(?:live|transcribe|connect)(?:\/|%2F))[A-Za-z0-9_-]+/gi;

export function redactRoomCodes(text: string): string {
  return text.replace(ROOM_CODE_IN_URL, "$1[code]");
}

/**
 * P1325: sign-in tokens are bearer credentials that ride in page URLs — every signup lands on
 * /auth/verify?token_hash=, and /auth/callback carries ?code= or #access_token=. Redacted wherever a URL-bearing
 * string reaches Sentry or the CSP sink, alongside room codes.
 *
 * P1515 adds `k`: the unguessable token of a canvas open to anyone with the link (`#k=<32 hex>`, or the older
 * `?k=`), plain, URL-encoded inside a login redirect (up to double-encoded), HTML-escaped (`&amp;k=`) or with the
 * parameter NAME percent-encoded (`%6B=`). Canary: src/tests/p1515-canvas-link-token-redaction.test.ts.
 *
 * P1692 adds `token`: the access value of a one-to-one letter link (`/letter/<id>?token=`) and of an agreement
 * invitation (`/agreements/<id>/accept?token=`), plain or carried inside a sign-in redirect. A name must be followed
 * by `=`, so `token_hash` and `access_token` still match whole, and names that merely contain the word do not match.
 * Every credential-named parameter the app reads is checked against this pattern by
 * src/tests/p1692-address-credential-redaction.test.ts, so a new one fails a test.
 *
 * The pattern is GLOBAL: `.test()` on it keeps state between calls. It is for `.replace()` only. Whether a page load
 * is recorded is decided by parsing the query (src/lib/sentry-replay-guard.ts), never by this pattern.
 */
export const AUTH_TOKEN_IN_URL =/((?:[?&#;]|%3F|%26|%23|%253F|%2526|%2523)(?:token_hash|terms_nonce|ticket|access_token|refresh_token|provider_token|provider_refresh_token|code|token|k|%6B)(?:=|%3D|%253D))[^&#%\s"'<>]+/gi;

export function redactAuthTokens(text: string): string {
  return text.replace(AUTH_TOKEN_IN_URL, "$1[redacted]");
}
