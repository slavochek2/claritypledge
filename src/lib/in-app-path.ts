/** A same-site path to send someone back to, or null. Control characters are refused: browsers strip tabs and
 *  newlines from URLs, so "/\t/evil.example" passes a first-characters check and then resolves off-site. */
export function inAppPath(raw: string | null | undefined): string | null {
  if (!raw || !/^\/[^/\\]/.test(raw) || [...raw].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) return null;
  try {
    return new URL(raw, 'https://same.invalid').origin === 'https://same.invalid' ? raw : null;
  } catch {
    return null;
  }
}
