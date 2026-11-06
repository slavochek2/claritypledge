/**
 * @file contact-code-utils.ts
 * @description P1556: pure helpers for contact codes and handles (no network, so they are unit-tested directly).
 */

/** [FOUNDER DECISION: link format] The route a contact code opens. Changing it also means index.html's and
 * url-token-redaction.ts's patterns, and the redirect allowlist. */
export const CONTACT_CODE_PATH = "/connect";

const TOKEN_RE = /^[0-9a-f]{32}$/;

export const isContactToken = (token: string | undefined): token is string =>
  !!token && TOKEN_RE.test(token);

/** The full link a code stands for, on the current site. */
export function contactCodeUrl(
  token: string,
  origin: string = window.location.origin,
): string {
  return `${origin}${CONTACT_CODE_PATH}/${token}`;
}

/**
 * What someone typed or pasted, reduced to a handle: spaces trimmed, a leading @ dropped, and a pasted profile
 * link (`…/p/<handle>`, with or without the site) cut to its handle. Returns '' when nothing handle-shaped is left.
 */
export function normalizeHandleQuery(input: string): string {
  let s = input.trim();
  const fromUrl = s.match(/(?:^|\/)p\/([^/?#\s]+)/i);
  if (fromUrl?.[1]) s = fromUrl[1];
  s = s.replace(/^@+/, "").trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    // a stray % stays as typed
  }
  return /^[\p{L}\p{N}-]{1,100}$/u.test(s) ? s.toLowerCase() : "";
}
