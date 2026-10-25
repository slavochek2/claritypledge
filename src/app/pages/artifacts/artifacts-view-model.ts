/**
 * @file artifacts-view-model.ts
 * @description P1545 WP3: the pure model behind the Artifacts page. Turns the letter and canvas
 * services' rows into one list of rows per tab, and holds every rule the page applies to them: the
 * one meta line, the Inbox partition, the type filter, the title search and the unread count.
 *
 * Kept free of React and of the services so each rule is a plain function a unit test can pin.
 *
 * Rules (spec "Resolved Decisions" and "Spec review amendments"):
 *  - Yours = drafts + sent letters + own canvases. Shared with you = letters sent to you + canvases
 *    shared with you.
 *  - Inbox rows about activity on YOUR letters (completed, reading, responded) never become rows and
 *    never count as unread; they join onto the matching sent letter's "N of M done".
 *  - One meta line per row, `[state] · [one fact] · [time]` (Letters parity). Words, never a dot, for
 *    activity on your own letters ("1 new from Tom"); "done" is the vocabulary everywhere.
 *  - An unread dot exists only on Shared with you.
 */
import { formatTimeAgo } from '@/app/utils/format-time';
import { newCountForDelivery } from '@/app/utils/letter-new-activity';
import { canvasPath, canvasTitle } from '@/lib/canvas-boxes';
import type { CanvasSharedWithMe, MyCanvasRow } from '@/app/data/canvas-service';
import type { ClarityDoc, ClarityLetter, InboxItem, LetterDelivery } from '@/app/types';

export type ArtifactTab = 'yours' | 'shared';
export type ArtifactTypeFilter = 'all' | 'letters' | 'canvases';

export const ARTIFACT_TABS: readonly ArtifactTab[] = ['yours', 'shared'];
export const ARTIFACT_TYPE_FILTERS: readonly ArtifactTypeFilter[] = ['all', 'letters', 'canvases'];

export type ArtifactState = 'draft' | 'sent' | 'canvas' | 'received-letter' | 'received-canvas';

/** What the "…" menu can hold (quick actions only). The page maps each id to its handler; the model decides which apply. */
export type RowActionId =
  | 'prepare-letter'
  | 'delete-draft'
  | 'copy-public-link'
  | 'delete-letter'
  | 'share-canvas';

export interface RowAction {
  id: RowActionId;
  label: string;
  /** Shown under the label and the item is disabled (today's guards). */
  disabledReason?: string;
  /** Red, last, below a separator. */
  danger?: boolean;
}

export interface ArtifactRow {
  /** Unique across both tabs, e.g. `draft:<docId>`. */
  key: string;
  kind: 'letter' | 'canvas';
  tab: ArtifactTab;
  state: ArtifactState;
  title: string;
  /** The ONE meta line. */
  meta: string;
  /** Own items only (null on Shared with you). */
  visibility: 'public' | 'private' | null;
  /** Shared with you only; always false on Yours. */
  unread: boolean;
  /** Where a tap goes: the item's existing page. Null when it cannot be built (no handle yet). */
  href: string | null;
  /** Newest first within a tab. */
  sortAt: number;
  menu: RowAction[];
  ref: {
    docId?: string;
    letterId?: string;
    deliveryId?: string;
    canvasName?: string;
    ownerId?: string;
    generalAccess?: 'restricted' | 'link';
    hasAudience?: boolean;
    isPublicLetter?: boolean;
  };
}

export type SentLetter = ClarityLetter & { doc_title: string };

export interface ArtifactsSource {
  docs: ClarityDoc[];
  sentLetters: SentLetter[];
  deliveriesByLetter: Record<string, LetterDelivery[]>;
  inbox: InboxItem[];
  myCanvases: MyCanvasRow[];
  sharedCanvases: CanvasSharedWithMe[];
  /** The signed-in person's public handle: own canvas addresses are built with it. */
  userSlug: string | null;
  /** Unread explain-backs per delivery id; combined with unread sender activity in `inbox` ("N new from <name>"). Absent = none. */
  newByDelivery?: Record<string, number>;
}

export interface ArtifactsModel {
  yours: ArtifactRow[];
  shared: ArtifactRow[];
}

// ---------------------------------------------------------------------------------------------
// Meta line
// ---------------------------------------------------------------------------------------------

/** "2h ago", "just now", or the short date the app already shows past a week ("Oct 3" reads as "on Oct 3"). */
export function agoPhrase(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = formatTimeAgo(iso);
  if (t === 'Just now') return 'just now';
  if (/^\d+[mhd]$/.test(t)) return `${t} ago`;
  return `on ${t}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** `[state] · [fact] · [time]`: empty parts are dropped. */
function joinMeta(parts: (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => !!p).join(' · ');
}

/**
 * "Draft · 3 stories, 5 points · 2h ago"; a draft already sent: "Draft · 3 stories, 5 points · used for 2 letters".
 */
export function draftMeta(opts: { updatedAt: string; stories: number; points: number; sentCount?: number }): string {
  const counts = `${plural(opts.stories, 'story', 'stories')}, ${plural(opts.points, 'point', 'points')}`;
  const tail = opts.sentCount && opts.sentCount > 0
    ? `used for ${plural(opts.sentCount, 'letter', 'letters')}`
    : agoPhrase(opts.updatedAt);
  return joinMeta(['Draft', counts, tail]);
}

/**
 * "Sent to 3 · 1 of 3 done · 2d ago"; while something is new: "Sent to 3 · 1 new from Tom · 1h ago";
 * public link: "Public link · 4 done · 2d ago".
 */
export function sentMeta(opts: {
  isPublic: boolean;
  recipientCount: number;
  doneCount: number;
  newCount?: number;
  /** One name per delivery with something new ("someone" when unnamed): not deduplicated. */
  newFrom?: string[];
  sealedAt?: string | null;
}): string {
  const state = opts.isPublic ? 'Public link' : opts.recipientCount > 0 ? `Sent to ${opts.recipientCount}` : 'No recipients yet';
  let fact: string | null = null;
  if (opts.newCount && opts.newCount > 0) {
    const who = opts.newFrom ?? [];
    fact = `${opts.newCount} new from ${who.length === 1 ? who[0] : `${who.length} people`}`;
  } else if (opts.isPublic) {
    fact = `${opts.doneCount} done`;
  } else if (opts.recipientCount > 0) {
    fact = `${Math.min(opts.doneCount, opts.recipientCount)} of ${opts.recipientCount} done`;
  }
  return joinMeta([state, fact, agoPhrase(opts.sealedAt)]);
}

/** "From Tom · 2 of 5 steps · 4d ago"; finished: "From Anna · done · 1w ago". */
export function receivedLetterMeta(item: InboxItem): string {
  const from = `From ${item.actor_name?.trim() || 'someone'}`;
  let fact: string | null = null;
  if (item.completed_at) fact = 'done';
  else if (item.total_steps !== undefined) fact = `${Math.min(item.steps_completed ?? 0, item.total_steps)} of ${item.total_steps} steps`;
  return joinMeta([from, fact, agoPhrase(item.timestamp)]);
}

/** "Edited 3d ago"; a canvas with no known edit just says "Canvas". */
export function canvasMeta(lastEdit: string | null): string {
  const ago = agoPhrase(lastEdit);
  return ago ? `Edited ${ago}` : 'Canvas';
}

/** "From Mara · 1h ago". */
export function sharedMeta(fromName: string | null | undefined, at: string): string {
  const ago = agoPhrase(at);
  const from = `From ${fromName?.trim() || 'someone'}`;
  return ago ? `${from} · ${capitalizeAgo(ago)}` : from;
}

function capitalizeAgo(s: string): string {
  // "1h ago" stays as is; "just now" / "on Oct 3" read fine lower-case after the dot, except "just now".
  return s === 'just now' ? 'Just now' : s.startsWith('on ') ? capitalize(s) : s;
}

// ---------------------------------------------------------------------------------------------
// Partition and join
// ---------------------------------------------------------------------------------------------

/** Inbox rows about letters sent TO the person: the only inbox rows Shared with you may show. */
export function receivedInboxItems(inbox: InboxItem[]): InboxItem[] {
  return inbox.filter(i => i.type === 'received');
}

/** Inbox rows about activity on the person's OWN letters: they join onto the sent letter, never list. */
export function senderActivityItems(inbox: InboxItem[]): InboxItem[] {
  return inbox.filter(i => i.type !== 'received');
}

/**
 * Done count per sent letter: deliveries that completed, unioned by delivery id with the completed
 * sender-side activity the inbox reported (the inbox is capped, the deliveries are not, so either
 * may lag the other).
 */
export function repliedCountByLetter(
  deliveriesByLetter: Record<string, LetterDelivery[]>,
  inbox: InboxItem[],
): Record<string, number> {
  const done: Record<string, Set<string>> = {};
  const add = (letterId: string, deliveryId: string) => {
    (done[letterId] ??= new Set()).add(deliveryId);
  };
  for (const [letterId, deliveries] of Object.entries(deliveriesByLetter)) {
    for (const d of deliveries) if (d.status === 'completed') add(letterId, d.id);
  }
  for (const item of senderActivityItems(inbox)) {
    if (item.type === 'recipient_responded' || item.type === 'link_respondent') add(item.letter_id, item.delivery_id);
  }
  return Object.fromEntries(Object.entries(done).map(([k, v]) => [k, v.size]));
}

// ---------------------------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------------------------

const ms = (iso: string | null | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
};

export function draftRow(doc: ClarityDoc, sentCount = 0): ArtifactRow {
  return {
    key: `draft:${doc.id}`,
    kind: 'letter',
    tab: 'yours',
    state: 'draft',
    title: doc.title,
    meta: draftMeta({ updatedAt: doc.updated_at, stories: doc.story_count, points: doc.point_count, sentCount }),
    visibility: doc.visibility === 'public' ? 'public' : 'private',
    unread: false,
    href: `/letters/drafts/${doc.id}`,
    sortAt: ms(doc.updated_at),
    menu: [
      {
        id: 'prepare-letter',
        label: 'Prepare letter',
        disabledReason: doc.story_count === 0 ? 'Add at least one story first.' : undefined,
      },
      {
        id: 'delete-draft',
        label: 'Delete',
        danger: true,
        disabledReason: doc.has_sent_letters ? "Can't delete — letters were sent from this draft." : undefined,
      },
    ],
    ref: { docId: doc.id },
  };
}

export function sentRow(
  letter: SentLetter,
  deliveries: LetterDelivery[],
  done: number,
  newByDelivery: Record<string, number> = {},
  activityByDelivery: Record<string, string> = {},
): ArtifactRow {
  const isPublic = letter.mode === 'one-to-many';
  const recipientCount = deliveries.filter(d => d.receiver_email).length;
  const newOf = (d: LetterDelivery) => newCountForDelivery(newByDelivery[d.id] ?? 0, d.id in activityByDelivery);
  const withNew = deliveries.filter(d => newOf(d) > 0);
  const newCount = withNew.reduce((n, d) => n + newOf(d), 0);
  const newFrom = withNew.map(d => d.receiver_name?.trim() || 'someone');
  // While something is new the row's time is the latest unread activity, not the sealing.
  const latestActivity = withNew.reduce((t, d) => Math.max(t, ms(activityByDelivery[d.id])), 0);
  const base = letter.sealed_at ?? letter.created_at;
  const shownAt = latestActivity > 0 ? new Date(latestActivity).toISOString() : base;
  return {
    key: `sent:${letter.id}`,
    kind: 'letter',
    tab: 'yours',
    state: 'sent',
    title: letter.doc_title,
    meta: sentMeta({ isPublic, recipientCount, doneCount: done, newCount, newFrom, sealedAt: shownAt }),
    visibility: isPublic ? 'public' : 'private',
    unread: false,
    href: `/letter/${letter.id}/overview`,
    sortAt: ms(shownAt),
    // Quick actions only: Add recipients and Preview live on the overview page (a tap on the row).
    menu: [
      ...(isPublic ? [{ id: 'copy-public-link' as const, label: 'Copy public link' }] : []),
      // Any delivery (recipients and link respondents) means the letter was shared: Delete stays in the
      // menu, disabled with today's reason. The handler still maps DELIVERIES_EXIST from the server.
      {
        id: 'delete-letter' as const,
        label: 'Delete letter',
        danger: true,
        ...(deliveries.length > 0 ? { disabledReason: "Can't delete — letter has been shared." } : {}),
      },
    ],
    ref: { letterId: letter.id, isPublicLetter: isPublic },
  };
}

export function ownCanvasRow(c: MyCanvasRow, userSlug: string | null): ArtifactRow {
  return {
    key: `canvas:${c.name}`,
    kind: 'canvas',
    tab: 'yours',
    state: 'canvas',
    title: canvasTitle(c.name),
    meta: canvasMeta(c.lastEdit),
    visibility: c.generalAccess === 'link' ? 'public' : 'private',
    unread: false,
    href: userSlug ? canvasPath(userSlug, c.name) : null,
    sortAt: ms(c.lastEdit),
    menu: [{ id: 'share-canvas', label: 'Share' }],
    ref: { canvasName: c.name, generalAccess: c.generalAccess, hasAudience: c.hasAudience },
  };
}

export function receivedLetterRow(item: InboxItem): ArtifactRow {
  return {
    key: `received:${item.delivery_id}`,
    kind: 'letter',
    tab: 'shared',
    state: 'received-letter',
    title: item.title,
    meta: receivedLetterMeta(item),
    visibility: null,
    unread: !item.read_at,
    // A finished letter goes straight to its results; an open one to the reading flow (inbox-tab.tsx).
    href: item.completed_at
      ? `/letter/${item.letter_id}/results?delivery=${item.delivery_id}`
      : `/letter/${item.delivery_id}`,
    sortAt: ms(item.timestamp),
    menu: [],
    ref: { deliveryId: item.delivery_id, letterId: item.letter_id },
  };
}

export function receivedCanvasRow(c: CanvasSharedWithMe): ArtifactRow {
  return {
    key: `shared-canvas:${c.canvasId}`,
    kind: 'canvas',
    tab: 'shared',
    state: 'received-canvas',
    title: canvasTitle(c.name),
    meta: sharedMeta(c.ownerName, c.sharedAt),
    visibility: null,
    unread: c.unread,
    href: c.ownerSlug ? canvasPath(c.ownerSlug, c.name) : null,
    sortAt: ms(c.sharedAt),
    menu: [],
    ref: { canvasName: c.name, ownerId: c.ownerId },
  };
}

/** Latest unread sender-side activity time per delivery id (a recipient started, finished or responded). */
export function unreadActivityByDelivery(inbox: InboxItem[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of senderActivityItems(inbox)) {
    if (i.read_at) continue;
    if (!(i.delivery_id in out) || ms(i.timestamp) > ms(out[i.delivery_id])) out[i.delivery_id] = i.timestamp;
  }
  return out;
}

const newestFirst = (a: ArtifactRow, b: ArtifactRow) => b.sortAt - a.sortAt;

export function buildArtifacts(src: ArtifactsSource): ArtifactsModel {
  const replied = repliedCountByLetter(src.deliveriesByLetter, src.inbox);
  const sentCounts: Record<string, number> = {};
  for (const l of src.sentLetters) sentCounts[l.source_doc_id] = (sentCounts[l.source_doc_id] ?? 0) + 1;
  const activity = unreadActivityByDelivery(src.inbox);
  const yours = [
    ...src.docs.map(d => draftRow(d, sentCounts[d.id] ?? 0)),
    ...src.sentLetters.map(l => sentRow(l, src.deliveriesByLetter[l.id] ?? [], replied[l.id] ?? 0, src.newByDelivery, activity)),
    ...src.myCanvases.map(c => ownCanvasRow(c, src.userSlug)),
  ].sort(newestFirst);
  const shared = [
    ...receivedInboxItems(src.inbox).map(receivedLetterRow),
    ...src.sharedCanvases.map(receivedCanvasRow),
  ].sort(newestFirst);
  return { yours, shared };
}

// ---------------------------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------------------------

export function filterByType(rows: ArtifactRow[], type: ArtifactTypeFilter): ArtifactRow[] {
  if (type === 'all') return rows;
  const kind = type === 'letters' ? 'letter' : 'canvas';
  return rows.filter(r => r.kind === kind);
}

/** Title search, case-insensitive, whitespace-trimmed. An empty query keeps every row. */
export function filterByQuery(rows: ArtifactRow[], query: string): ArtifactRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(r => r.title.toLowerCase().includes(q));
}

export type YoursSectionId = 'drafts' | 'sent' | 'canvases';

export interface YoursSection {
  id: YoursSectionId;
  title: string;
  rows: ArtifactRow[];
}

const YOURS_SECTIONS: readonly { id: YoursSectionId; title: string; state: ArtifactState }[] = [
  { id: 'drafts', title: 'Drafts', state: 'draft' },
  { id: 'sent', title: 'Sent', state: 'sent' },
  { id: 'canvases', title: 'Canvases', state: 'canvas' },
];

/**
 * Yours under its headings, in the order Drafts, Sent, Canvases (each row keeps its newest-first
 * order). A heading with no rows is left out, so call this on the rows AFTER the chip and search
 * filters: a tap under Drafts always edits, a tap under Sent always opens the overview.
 */
export function yoursSections(rows: ArtifactRow[]): YoursSection[] {
  return YOURS_SECTIONS
    .map(({ id, title, state }) => ({ id, title, rows: rows.filter(r => r.state === state) }))
    .filter(section => section.rows.length > 0);
}

export function visibleRows(rows: ArtifactRow[], type: ArtifactTypeFilter, query: string): ArtifactRow[] {
  return filterByQuery(filterByType(rows, type), query);
}

/** Unread items in Shared with you (letters + canvases), minus keys the person has already opened here. */
export function unreadSharedCount(shared: ArtifactRow[], openedKeys: ReadonlySet<string> = new Set()): number {
  return shared.filter(r => r.unread && !openedKeys.has(r.key)).length;
}

// ---------------------------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------------------------

export function parseTab(raw: string | null): ArtifactTab {
  return raw === 'shared' ? 'shared' : 'yours';
}

export function parseType(raw: string | null): ArtifactTypeFilter {
  return raw === 'letters' || raw === 'canvases' ? raw : 'all';
}
