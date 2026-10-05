/**
 * The share link: tap intervals plus the song's name, carried in the URL hash so no
 * server ever sees them. The name is base64-encoded so a listener cannot read it off
 * the address bar at a glance. This is a game, not security.
 *
 * Everything decoded here comes from a URL anyone can type, so every field is
 * validated and bounded, and anything malformed decodes to null (the normal page).
 */

export const MIN_TAPS = 6;
export const MAX_TAPS = 64;
export const MIN_INTERVAL_MS = 60;
export const MAX_INTERVAL_MS = 2000;
export const MAX_NAME_CHARS = 60;
/** Longest raw hash we are willing to decode. A full payload is well under half this. */
export const MAX_HASH_CHARS = 2048;

const HASH_KEY = "listen=";

export interface SharedTaps {
  /** Milliseconds between consecutive taps. Length is taps minus one. */
  intervals: number[];
  song: string;
}

export function clampInterval(ms: number): number {
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(ms)));
}

/** Plain text only: control characters dropped, whitespace collapsed, length capped. */
export function cleanSongName(raw: string): string {
  const noControl = Array.from(raw)
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join("");
  const collapsed = noControl.replace(/\s+/g, " ").trim();
  return Array.from(collapsed).slice(0, MAX_NAME_CHARS).join("");
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Returns the hash fragment, starting with "#", or null when there is nothing to share. */
export function encodeShareHash(intervals: number[], song: string): string | null {
  const name = cleanSongName(song);
  if (!name || intervals.length < MIN_TAPS - 1) return null;
  const t = intervals.slice(0, MAX_TAPS - 1).map(clampInterval);
  return `#${HASH_KEY}${toBase64Url(JSON.stringify({ v: 1, t, s: name }))}`;
}

/** Decodes a location hash. Any malformed, oversized or out-of-range input returns null. */
export function decodeShareHash(hash: string): SharedTaps | null {
  if (!hash || hash.length > MAX_HASH_CHARS) return null;
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!body.startsWith(HASH_KEY)) return null;

  const json = fromBase64Url(body.slice(HASH_KEY.length));
  if (json === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { v, t, s } = parsed as { v?: unknown; t?: unknown; s?: unknown };
  if (v !== 1 || !Array.isArray(t) || typeof s !== "string") return null;
  if (t.length < MIN_TAPS - 1) return null;

  const intervals: number[] = [];
  for (const item of t.slice(0, MAX_TAPS - 1)) {
    if (typeof item !== "number" || !Number.isFinite(item)) return null;
    intervals.push(clampInterval(item));
  }

  const song = cleanSongName(s);
  if (!song) return null;
  return { intervals, song };
}

/** Loose match between a listener's guess and the song: case, punctuation and "the" ignored. */
export function guessMatches(guess: string, song: string): boolean {
  const norm = (x: string) =>
    x
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\bthe\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const g = norm(guess);
  const s = norm(song);
  if (!g || !s) return false;
  if (g === s) return true;
  const shorter = g.length < s.length ? g : s;
  const longer = g.length < s.length ? s : g;
  return shorter.length >= 4 && longer.includes(shorter);
}
