/**
 * @file event-links.ts
 * @description P1179: the entry model behind the event room's "Links" menu.
 *
 * The list is STATIC for the whole event — the host never advances or changes
 * anything during the room. That is the property the design exists to provide
 * (spec §1); a host-advances-blocks control was proposed and rejected.
 *
 * SECURITY — the open-redirect invariant, enforced by construction:
 * an entry never carries a URL. A stake entry carries a TAG, which this module
 * is the only thing that turns into a path, and it turns it into exactly one
 * shape: `/stake/:tag`. The two tool entries carry a hardcoded internal path
 * from this file, not from data. So there is no input through which an external
 * or protocol-relative destination can reach a link — the same guarantee
 * short-links.ts:40-42 gets with a runtime check, obtained here without one.
 */

import type { EventLinkEntry } from '@/app/types';

/** A resolved, renderable menu entry. `to` is always an internal path. */
export interface LinksMenuEntry {
  /** Verbatim rendered label. Never agent-authored — see spec Resolved Decisions 1/1b. */
  label: string;
  /** Internal path. Never external, never protocol-relative. */
  to: string;
  /** Which group it renders in — drives the separator and the "This event" heading. */
  group: 'stake' | 'tools' | 'event';
}

/**
 * A tag is a bare token. This rejects every shape that could become an external
 * or traversing destination: `//evil.com`, `https://evil.com`, `../../admin`,
 * and anything carrying a slash, colon, dot or whitespace.
 */
const SAFE_TAG = /^[a-z0-9][a-z0-9_-]*$/i;

export function isSafeTag(tag: unknown): tag is string {
  return typeof tag === 'string' && tag.length <= 64 && SAFE_TAG.test(tag);
}

/**
 * The standard stake destinations. Labels ARE the tags — founder decision
 * (Resolved Decisions 1): "if I say go to the menu and then select the CMP7",
 * the spoken word and the rendered label are the same token. The prototype's
 * "Seven dimensions" / "The triad" / "All ten" are NOT approved copy.
 *
 * `cmp10` was REMOVED 2026-08-31 (founder: "I would suggest to delete CMP10.
 * Let's keep it simple") and RESTORED 2026-09-07 at the founder's explicit
 * instruction, alongside `understanding` and `misunderstanding`. The 2026-08-31
 * reasoning is not withdrawn — it is overridden: this menu is now the room's
 * index of every standing instrument, not a shortlist. Content was verified in
 * prod before adding, so none of the five is an empty feed: cmp7=7, cmp3=3,
 * cmp10=10 points on `tags`; understanding=18, misunderstanding=11 on
 * `system_tags`.
 *
 * `understanding` and `misunderstanding` are SYSTEM tags — they live in the
 * `system_tags` column, not `tags`. Nothing here needs to know that: the stake
 * page routes through `getPublicPointsFeed` / `getPublicStoriesFeed`, both of
 * which branch on `isSystemTag()` (feed-utils.ts, where both words are already
 * explicit SYSTEM_TAG_VALUES) and query the right column. Verified before
 * adding — a tag that needed a third code path would not belong in this list.
 *
 * NOTHING CAPS THIS LIST — and in particular the auto-hide probe in
 * event-links-menu.tsx does not, though an earlier draft of this comment claimed it
 * did. That probe's PROBE_CAP is scoped to the `event` group (the per-event extras)
 * and never sees the standard tags, which are the framework's permanent surfaces and
 * are deliberately never hidden when empty. So the check that was cited as the
 * safety net for growing this list could not have fired at any size. Caught in
 * hostile review, in the same change that grew the set from 2 to 5.
 *
 * A sixth standing instrument is therefore a judgement call with no mechanical
 * backstop: the design assumes a short list under the thumb, and the only thing
 * enforcing that is this comment.
 */
export const STANDARD_STAKE_TAGS = ['cmp7', 'cmp3', 'cmp10', 'understanding', 'misunderstanding'] as const;

/**
 * The two standard tool destinations. Both labels are existing product copy,
 * not new words: "Transcribe" is the product name (P1149) and "Start a Clarity
 * Session" is verbatim the nav's own CTA wording (simple-navigation.tsx).
 */
export const STANDARD_TOOL_ENTRIES: ReadonlyArray<{ label: string; to: string }> = [
  { label: 'Transcribe', to: '/transcribe' },
  { label: 'Start a Clarity Session', to: '/live' },
];

/** Path for a stake destination, carrying the event alongside when there is one. */
export function stakePath(tag: string, eventSlug?: string | null): string {
  const base = `/stake/${encodeURIComponent(tag)}`;
  return eventSlug ? `${base}?event=${encodeURIComponent(eventSlug)}` : base;
}

/**
 * Build the menu. Four standard entries always; the event's own extras go FIRST.
 *
 * ORDER (founder, 2026-08-31): "tonight should be the first link if the event
 * has it." The per-event tag is the reason this attendee is in this room right
 * now; the standing instruments are the same at every event and can sit below
 * it. The DESIGN assumes a short, hand-curated list — no scrolling, no
 * scanning, the event-specific destination under the thumb first — but nothing
 * in this module caps `extras.length`; the auto-hide probe in
 * event-links-menu.tsx enforces a hard fan-out cap for exactly this reason.
 *
 * An extra that fails `isSafeTag` is DROPPED, not rendered and not thrown on —
 * a malformed row written at publish time must not take the room's menu down
 * mid-event (DW-3: "rejected or ignored").
 */
export function buildLinksMenu(
  extras: EventLinkEntry[] | null | undefined,
  eventSlug?: string | null
): LinksMenuEntry[] {
  const entries: LinksMenuEntry[] = [];
  const standardTags = new Set<string>(STANDARD_STAKE_TAGS);

  for (const extra of extras ?? []) {
    if (!extra || typeof extra !== 'object') continue;
    if (!isSafeTag(extra.tag)) continue;
    // An operator-configured extra sharing a tag with a standard entry (e.g.
    // `cmp7`) would otherwise render the same /stake/:tag destination twice —
    // once as "this event", once as standard. The standard entry always wins;
    // it renders unconditionally below regardless of what extras say.
    if (standardTags.has(extra.tag)) continue;
    // `label ?? tag` — Resolved Decision 3: one column, one render path with a
    // fallback, nothing required of the operator at publish time.
    const label = typeof extra.label === 'string' && extra.label.trim() ? extra.label.trim() : extra.tag;
    entries.push({ label, to: stakePath(extra.tag, eventSlug), group: 'event' });
  }

  for (const tag of STANDARD_STAKE_TAGS) {
    entries.push({ label: tag, to: stakePath(tag, eventSlug), group: 'stake' });
  }
  // The separator the approved reference puts before Transcribe falls between
  // these two groups; the sheet draws it from the group change, not from data.
  for (const tool of STANDARD_TOOL_ENTRIES) {
    entries.push({ label: tool.label, to: tool.to, group: 'tools' });
  }

  return entries;
}

/**
 * The event slug the menu should carry, read from the URL alone.
 *
 * Two shapes, and only these two: a room route (`/events/:slug/room|ready|meet`)
 * and the stake surface's `?event=` param. A bare `/stake/:tag` yields null —
 * no button, no event context, a handable cut-down feed (Resolved Decision 2).
 */
export function eventSlugFromLocation(pathname: string, search: string): string | null {
  // Hardcodes the three room-shaped routes — must match App.tsx's own
  // `/events/:slug/room|ready|meet` entries. A future 4th room route added
  // there without a matching update here silently loses the Links button; no
  // test ties the two lists together, so if you add one, add it in both.
  const room = pathname.match(/^\/events\/([^/]+)\/(?:room|ready|meet)\/?$/);
  if (room) return decodeURIComponent(room[1]);
  if (/^\/stake\/[^/]+\/?$/.test(pathname)) {
    const slug = new URLSearchParams(search).get('event');
    return slug && slug.trim() ? slug : null;
  }
  return null;
}

/**
 * The standalone (event-less) surfaces that also carry the Links menu.
 *
 * Founder, 2026-09-07: "add the links exactly like we have in the events also
 * for /ready and /meet". These two pages are the same room ritual run outside
 * an event, so they get the same index of standing instruments — the standard
 * stake tags and the two tools. There is no event, so there are no "This event"
 * extras and `buildLinksMenu` is called with `null`/`null`: the entries are
 * bare `/stake/:tag` paths with no `?event=`, which is exactly what a bare
 * stake surface expects (Resolved Decision 2).
 */
const STANDALONE_LINKS_PATHS = /^\/(?:ready|meet)\/?$/;

/** Whether the nav should mount the Links menu at all on this location. */
export function linksMenuAppliesTo(pathname: string, search: string): boolean {
  return STANDALONE_LINKS_PATHS.test(pathname) || eventSlugFromLocation(pathname, search) !== null;
}
