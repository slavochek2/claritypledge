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
 * Let's keep it simple"). It is dropped from the MENU only — `/stake/cmp10`
 * still resolves, because the route is global and the tag keeps working for
 * anyone holding the link; what changed is that the room stops offering a third
 * instrument nobody had asked for mid-event.
 */
export const STANDARD_STAKE_TAGS = ['cmp7', 'cmp3'] as const;

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
