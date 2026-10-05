/**
 * @file set-labels.ts
 * @description P1337 (founder walkthrough 6, designer's call): statement sets are named in words
 * people read, not as a bare hashtag, wherever a name is known. The event's own set is named by
 * the page that links to compare (the event topic); the preparation's benefits set keeps the name
 * its step already uses. Anything else stays `#tag` — a person's own hashtag is their wording.
 */
const KNOWN_SETS: Record<string, string> = {
  // prep-plan.ts STEP_LABELS.cmp7: "Share your view on the expected benefits".
  cmp7: 'Expected benefits',
};

export function setLabel(tag: string, fromPage?: Record<string, string> | null): string {
  return fromPage?.[tag] ?? KNOWN_SETS[tag] ?? `#${tag}`;
}

/** The sets named above — offered wherever a list of existing sets is shown (the host's "Match on"). */
export function knownSetTags(): string[] {
  return Object.keys(KNOWN_SETS);
}
