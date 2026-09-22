/**
 * @file event-links.ts
 * @description P1179: the entry model behind the event room's "Links" menu.
 *
 * The list is STATIC for the whole event — the host never advances or changes
 * anything during the room. That is the property the design exists to provide
 * (spec §1); a host-advances-blocks control was proposed and rejected.
 *
 * SECURITY — the open-redirect invariant, enforced by construction:
 * an entry never carries a URL. A points entry carries a TAG, which this module
 * is the only thing that turns into a path, and it turns it into exactly one
 * shape: `/stake/:tag`. The tool entries and the nine letter entries carry a
 * hardcoded internal path built in this file, not from data. So there is no input
 * through which an external or protocol-relative destination can reach a link —
 * the same guarantee short-links.ts:40-42 gets with a runtime check, obtained
 * here without one.
 *
 * P1323: the per-event "This event" group is RETIRED. It carried a TAG, i.e. the
 * same thing a points entry carries, so it was a second event-scoped copy of the
 * list the Points tab already renders — and no UI to populate `events.links` ever
 * existed, which is why 0 of 14 prod events had one. The COLUMN and the
 * `EventLinkEntry` type are deliberately kept (not migrated), so restoring the
 * capability is a code change against data that is still there. Do not drop them.
 */

/** A resolved, renderable menu entry. `to` is always an internal path. */
export interface LinksMenuEntry {
  /** Verbatim rendered label. Never agent-authored — see spec Resolved Decisions 1/1b. */
  label: string;
  /** Internal path. Never external, never protocol-relative. */
  to: string;
  /**
   * Which TAB it renders under. P1323 renamed `stake` → `points` (the founder's own
   * word: "instruments is a point collection... maybe we want to call it just points")
   * and removed `event` with the per-event group.
   */
  group: 'points' | 'letters' | 'tools';
  /**
   * A quiet suffix rendered after the label. Used by the letters, whose `stN` codes are
   * internal taxonomy and may not lead (decisions.md: "do not surface them as primary
   * labels on outward-facing surfaces") but are what the founder says out loud in a room.
   */
  hint?: string;
  /**
   * Open with a document load in a new tab instead of a router navigation.
   *
   * TWO reasons, and they are different — do not collapse them:
   *
   *   1. P1310, `/presi`: the path lives OUTSIDE the SPA router (a static page under
   *      `public/`, rewritten by vercel.json), so `navigate()` would hit the 404 route.
   *      A new tab is the only thing that reaches it without tearing down a live room.
   *   2. P1323, the nine letters: `/letter/<code>` IS inside the router, so a same-tab
   *      `navigate()` would work — and would do harm. The route is immersive, so the nav
   *      is suppressed (`clarity-landing-layout.tsx`) leaving no way back to this menu,
   *      AND `room-capture-context.tsx` pauses a running capture on an immersive route
   *      while the session bar stops rendering. The host would believe the room is still
   *      recording. A new tab leaves the room running behind it.
   *
   * So this flag is NOT "the path is outside the router" — an earlier version of this
   * comment said exactly that, and the letters falsify it. It is "a document load in a
   * new tab is the correct way to reach this destination". Still an internal path; this
   * does not relax the no-URL invariant in the file header.
   */
  newTab?: boolean;
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
 * `aisafety1` was added 2026-09-16 (P1323) as the sixth. Verified on prod before
 * adding, to the bar this comment set: 4 points and 8 stories, and it lives in the
 * user `tags` column, NOT `system_tags` — `isSystemTag` (feed-utils.ts) matches only
 * `^st\d+$`, `^v\d+$`, `understanding` and `misunderstanding` — so the stake surface's
 * existing branch already queries the right column and no third code path is needed.
 *
 * NOTHING CAPS THIS LIST, and the thing that used to be cited as the cap is now gone
 * anyway. The auto-hide probe's PROBE_CAP was scoped to the `event` group (the
 * per-event extras) and never saw these tags; P1323 retired that group, so the probe
 * no longer exists at all. An earlier draft of this comment claimed the probe capped
 * this list — it could not have fired at any size. Caught in hostile review.
 *
 * P1323 also changed what "too long" means here. These entries now share a panel with
 * nine letters and three tools, but under a TAB rather than in one flat list, so
 * growing this array lengthens one tab instead of the whole sheet. That is a weaker
 * pressure than before, not an absent one: a seventh standing instrument is still a
 * judgement call with no mechanical backstop, and the only thing enforcing the short
 * list under the thumb is this comment.
 *
 * Moving this list into founder-editable data is DEFERRED to its own spec (P1323 R4),
 * which must also cover LETTERS below and must own a real write path — a migration is
 * a deploy, so "editable without a deploy" is not delivered by one. Whatever ships
 * there supplies a TAG, never a path or a URL, or the invariant in the file header
 * breaks.
 */
export const STANDARD_STAKE_TAGS = [
  'cmp7',
  'cmp3',
  'cmp10',
  'understanding',
  'misunderstanding',
  'aisafety1',
] as const;

/**
 * The nine sealed one-to-many letters, P1323 R3.
 *
 * `resolve_letter_shortcode` serves exactly these nine: verified on prod 2026-09-16,
 * `st1`–`st9` each resolve to a letter id and `st10` returns null. `/letter/<code>` is
 * resolved by `LetterRoute` (App.tsx), which looks the code up and replaces the URL with
 * the letter's UUID.
 *
 * LABELS ARE FOUNDER-APPROVED COPY (2026-09-16), not agent-authored. Eight were approved
 * verbatim from the /tree/links-menu prototype; `st5` was shortened from "You cannot grade
 * your own understanding" (38 chars, cut on both phone widths) to the 30 below.
 *
 * VERIFYING THESE AGAINST THE LETTERS IS NOT A PLAIN LOOKUP — READ THIS FIRST.
 * `docs/technical/badge-points-reference.md` maps station → statement, but it was exported
 * 2026-04-12 and `supabase/migrations/20260413100000_p701_st_swap.sql` renumbered three
 * stations the NEXT DAY (old st3→st2, old st5→st3, old st2→st5). Read against that export
 * without applying the swap, three of these look misfiled; read through it, all nine are
 * correct. A future agent "fixing" st2/st3/st5 from the stale export would be reverting
 * them to the wrong letters.
 *
 * CHARACTER BUDGET, measured at /tree/links-menu: a row is cut at roughly 24–28 characters
 * at 320x568 and around 34 at 375x667, and the `stN` hint is the first thing lost. Budget
 * for a new label: ~30 to stay whole on a normal phone, ~24 on a small one.
 *
 * Moving this list into data is DEFERRED with the tags above (P1323 R4) — it is the LONGER
 * of the two lists and the one still growing, so the deferred spec must cover it rather
 * than giving the shorter list the good ergonomics.
 */
export const STANDARD_LETTER_ENTRIES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'st1', label: 'Three kinds of understanding' },
  { code: 'st2', label: 'Explain it back' },
  { code: 'st3', label: 'Shared belief vs common belief' },
  { code: 'st4', label: 'Explain back without judgment' },
  { code: 'st5', label: 'Grading your own understanding' },
  { code: 'st6', label: 'Agreement is not understanding' },
  { code: 'st7', label: 'Knowing that they know' },
  { code: 'st8', label: 'Putting it in writing' },
  { code: 'st9', label: 'A public signal' },
];

/**
 * Path for a letter. Built HERE from a validated code, never taken from data — the same
 * construction the file header's invariant rests on for `/stake/:tag`.
 */
export function letterPath(code: string): string {
  return `/letter/${encodeURIComponent(code)}`;
}

/**
 * The standard tool destinations. Labels are existing product copy, not new
 * words: "Transcribe" is the product name (P1149), "Start a Clarity Session" is
 * verbatim the nav's own CTA wording (simple-navigation.tsx), and "Slides" is
 * the founder's own word for `/presi` (P1310; chosen over "Prezi" and
 * "Presentation").
 *
 * `/presi` is the live deck — a STATIC page under `public/presi/`, rewritten by
 * `vercel.json`, NOT a route in `App.tsx`. Two consequences, both load-bearing:
 *
 *   1. `newTab` is required, not a preference. A router `navigate('/presi')`
 *      renders the SPA's 404 because no route matches; a same-document load
 *      would reach the deck but tear down a live room to do it. The room stays
 *      running behind the new tab.
 *   2. It changes NOTHING about the open-redirect invariant this module exists
 *      to hold (file header). `/presi` is a literal internal path written here,
 *      not a URL and not sourced from event data — so
 *      p1179-entry-safety.test.ts's shape assertions (starts with `/`, never
 *      `//`, never `scheme:`) hold for it exactly as they do for `/transcribe`.
 *      Do not "simplify" this to an absolute URL; that is the thing the
 *      invariant forbids.
 *
 * `/presi2` is the frozen June draft (P1218) and is deliberately NOT linked.
 */
export const STANDARD_TOOL_ENTRIES: ReadonlyArray<{ label: string; to: string; newTab?: boolean }> = [
  { label: 'Transcribe', to: '/transcribe' },
  { label: 'Start a Clarity Session', to: '/live' },
  { label: 'Slides', to: '/presi', newTab: true },
  // P1351: the Chiang Mai events calendar (founder: "slash cm the calendar … we can include it").
  // New tab: /cm is a chrome-free Google Calendar embed with no header, so a same-tab visit
  // would leave the user with no Tools button to come back through.
  { label: 'Chiang Mai events', to: '/cm', newTab: true },
];

/** Path for a stake destination, carrying the event alongside when there is one. */
export function stakePath(tag: string, eventSlug?: string | null): string {
  const base = `/stake/${encodeURIComponent(tag)}`;
  return eventSlug ? `${base}?event=${encodeURIComponent(eventSlug)}` : base;
}

/**
 * Build the menu: one flat array, tagged by which TAB each entry renders under.
 *
 * P1323 turned one flat list into three tabs (Points · Letters · Tools). The array stays
 * flat on purpose — the entry-safety suite asserts shape properties across EVERY entry,
 * and a nested structure would let a new group be added without those assertions reaching
 * it. The component groups by `group`; this module owns what the groups contain.
 *
 * ORDER within a tab is the array order here. Across tabs the order is Points, Letters,
 * Tools, matching the segmented control.
 *
 * THE PER-EVENT EXTRAS ARGUMENT IS GONE (P1323 R5). The old signature took
 * `(extras, eventSlug)` and rendered the event's own tags FIRST, on the founder's
 * 2026-08-31 reasoning that "tonight should be the first link if the event has it."
 * That reasoning is not withdrawn — it is moot: an extra carried a TAG, i.e. exactly what
 * a Points entry carries, and no UI to write `events.links` ever existed, so 0 of 14 prod
 * events had one. An event-specific tag now goes in STANDARD_STAKE_TAGS like any other.
 *
 * `eventSlug` STAYS, and is not vestigial: it is what puts `?event=` on every Points
 * entry, so a stake surface opened from inside a room still knows which room. Removing it
 * would silently drop event attribution from every stake link.
 */
export function buildLinksMenu(eventSlug?: string | null): LinksMenuEntry[] {
  const entries: LinksMenuEntry[] = [];

  for (const tag of STANDARD_STAKE_TAGS) {
    entries.push({ label: tag, to: stakePath(tag, eventSlug), group: 'points' });
  }
  for (const letter of STANDARD_LETTER_ENTRIES) {
    // `newTab` is REQUIRED here, not cosmetic — see LinksMenuEntry.newTab reason 2.
    entries.push({ label: letter.label, to: letterPath(letter.code), group: 'letters', hint: letter.code, newTab: true });
  }
  for (const tool of STANDARD_TOOL_ENTRIES) {
    entries.push({ label: tool.label, to: tool.to, group: 'tools', ...(tool.newTab ? { newTab: true } : {}) });
  }

  return entries;
}

/**
 * The event slug the menu should carry, read from the URL alone.
 *
 * Two shapes, and only these two: a room route (`/events/:slug/room|ready|meet`)
 * and the stake surface's `?event=` param. A bare `/stake/:tag` yields null — no event
 * context.
 *
 * P1323: null here NO LONGER means "no button". It used to, because `linksMenuAppliesTo`
 * was built on this function; that is the coupling P1323 removed. A bare `/stake/:tag`
 * now carries the menu like every other product surface and simply builds its entries
 * without `?event=`. P1179's Resolved Decision 2 ("a bare /stake/:tag ... with no button")
 * is superseded on the founder's explicit sign-off, 2026-09-16.
 */
export function eventSlugFromLocation(pathname: string, search: string): string | null {
  // Hardcodes the three room-shaped routes — must match App.tsx's own
  // `/events/:slug/room|ready|meet` entries. A future 4th room route added
  // there without a matching update here silently loses the Links button; no
  // test ties the two lists together, so if you add one, add it in both.
  const room = pathname.match(/^\/events\/([^/]+)\/(?:room|ready|meet)\/?$/);
  if (room) {
    // `decodeURIComponent` THROWS on a malformed percent-escape — `/events/%/room`
    // raises `URIError: URI malformed`. This function runs during the nav provider's
    // render on every route, so an unhandled throw here does not fail the menu, it
    // fails the whole navigation and the page under it. A slug that cannot be decoded
    // is not a slug: treat the location as carrying no event, which is the same
    // outcome as any other non-room path. (Found by adversarial review, P1310;
    // the defect predates this spec and lives in the function it extends.)
    try {
      return decodeURIComponent(room[1]);
    } catch {
      return null;
    }
  }
  if (/^\/stake\/[^/]+\/?$/.test(pathname)) {
    const slug = new URLSearchParams(search).get('event');
    return slug && slug.trim() ? slug : null;
  }
  return null;
}

/**
 * `linksMenuAppliesTo` and `STANDALONE_LINKS_PATHS` were REMOVED by P1323.
 *
 * They answered "should the menu mount on this location?" by asking "does this location
 * have an event?" — one predicate doing two different jobs. That is the defect P1323
 * exists to fix: a destination list that is entirely event-independent inherited an
 * event-dependent mount rule, so `/stake/understanding` shared without `?event=` rendered
 * the same page with no menu at all.
 *
 * The mount decision now lives where a route is DECLARED, not where it is matched:
 * `ClarityLandingLayout` takes a required `surface: 'product' | 'public'` prop and
 * `SimpleNavigation` renders the trigger when it is `product`. A new page cannot compile
 * without answering, so there is no list here to fall out of date — which is exactly what
 * a path regex would become.
 *
 * `eventSlugFromLocation` above SURVIVES and is unrelated to mounting: it answers the
 * other half of the original predicate ("is there an event here?") for the sole purpose of
 * putting `?event=` on a Points entry.
 */
