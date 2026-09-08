/**
 * Founder-authored group descriptions carry bare URLs (the public repo link on
 * · Chiang Mai). Rendering the body as plain text left them as dead text a reader
 * had to retype. Split on http(s) runs and anchor them; every href goes through
 * safeLinkHref, since `description` is DB-derived (.claude/rules/src.md —
 * user-controlled URL sinks).
 *
 * The match is deliberately greedy and the trimming happens afterwards, in
 * splitTrailingPunctuation. A narrower character class cannot do this job: excluding
 * ")" from the run fixes "(see https://x.com/a)" and breaks
 * "https://en.wikipedia.org/wiki/Foo_(bar)", while including it does the reverse.
 * Only counting the brackets tells the two apart.
 */
export const URL_RUN = /(https?:\/\/[^\s<>"']+)/g;

const SENTENCE_TAIL = ".,;:!?";

/** Split a greedy URL run into [href, text-that-was-never-part-of-it]. */
export function splitTrailingPunctuation(run: string): [string, string] {
  let url = run;
  let tail = "";
  for (;;) {
    const last = url[url.length - 1];
    if (!last) break;
    const count = (c: string) => url.split(c).length - 1;
    if (SENTENCE_TAIL.includes(last)) {
      // A full stop ending the sentence, not the address. Left attached, the href
      // becomes ".../claritypledge." — a repo name cannot end in a dot, so it 404s.
    } else if (last === ")" && count("(") < count(")")) {
      // Unbalanced: the bracket belongs to the prose around the link.
    } else if (last === "]" && count("[") < count("]")) {
      // Same, for square brackets.
    } else {
      break; // balanced, or an ordinary URL character
    }
    tail = last + tail;
    url = url.slice(0, -1);
  }
  return [url, tail];
}
