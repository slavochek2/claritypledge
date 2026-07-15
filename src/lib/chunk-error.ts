// Stale-deploy chunk-error detection.
//
// After a deploy, a tab still running the previous index.html requests asset
// hashes that no longer exist. That is not a bug — it is an expected cache
// miss, and the correct response is to prompt the user to reload rather than
// show a generic error screen (or report it to Sentry as an application error).
//
// The predicate lives here (rather than inline in App.tsx) so it can be
// unit-tested: App.tsx is the route tree and pulls the whole app graph on
// import, and ChunkErrorBoundary is not exported.

/**
 * Message fragments emitted by bundlers/browsers when a code-split asset
 * referenced by a stale document can no longer be fetched. Matched as
 * substrings against `Error.message`.
 */
const CHUNK_ERROR_MESSAGES = [
  // Vite / native dynamic import, across engines
  'Failed to fetch dynamically imported module',
  'Importing a module script failed',
  // webpack-style phrasing (kept: emitted by some third-party chunks)
  'Loading chunk',
  'Loading CSS chunk',
  // P988 — Vite's own module-preload helper phrasing, emitted when a
  // <link rel=modulepreload> CSS asset 404s after a deploy (JAVASCRIPT-REACT-2G,
  // katex CSS on /manifesto). Same stale-deploy class as the four above; without
  // it the boundary shows a generic error screen instead of the reload prompt.
  'Unable to preload CSS for',
];

/**
 * True when `message` indicates a stale-deploy asset fetch failure.
 */
export function isChunkErrorMessage(message: string): boolean {
  return CHUNK_ERROR_MESSAGES.some((fragment) => message.includes(fragment));
}
