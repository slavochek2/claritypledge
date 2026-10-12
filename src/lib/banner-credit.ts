/**
 * P1453: the "after <artist>" credit stored with an artist-style profile banner.
 *
 * `profiles.banner_credit` is written only by the edge functions (a guard trigger pins it for
 * client roles), but it is still rendered into the DOM, so every reader validates it here:
 * short strings with no control or bidi characters, and `ink` from a two-value enum that maps to
 * static classes — never a style value taken from the database.
 */

export type BannerInk = 'cream' | 'sepia';

export interface BannerCredit {
  /** The banner this credit belongs to; shown only while the banner URL equals it. */
  url: string;
  artist: string;
  sig: string;
  movement: string;
  ink: BannerInk;
}

// C0/C1 controls and the bidi overrides/isolates that can visually reorder text.
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/;

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > max || UNSAFE.test(s)) return null;
  return s;
}

export function parseBannerCredit(raw: unknown): BannerCredit | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const url = cleanText(r.url, 2048);
  const artist = cleanText(r.artist, 80);
  const sig = cleanText(r.sig, 80);
  const movement = cleanText(r.movement, 80) ?? '';
  const ink = r.ink === 'cream' || r.ink === 'sepia' ? r.ink : null;
  if (!url || !artist || !sig || !ink) return undefined;
  return { url, artist, sig, movement, ink };
}

/** The credit to show for `bannerUrl`, or undefined when none belongs to this exact banner. */
export function creditForBanner(
  bannerUrl: string | null | undefined,
  ...candidates: Array<BannerCredit | null | undefined>
): BannerCredit | undefined {
  if (!bannerUrl) return undefined;
  return candidates.find((c) => c?.url === bannerUrl) ?? undefined;
}
