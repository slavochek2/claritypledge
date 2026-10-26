/**
 * @file artifacts-view-model.ts
 * @description P1545 WP3: the pure model behind the Artifacts page. Turns the letter and canvas
 * services' rows into one list of rows per list, and holds every rule the page applies to them: the
 * one meta line, the Inbox partition, the title search, the dots and the URL state.
 *
 * Kept free of React and of the services so each rule is a plain function a unit test can pin.
 *
 * Rules (spec "Resolved Decisions", "Spec review amendments" and "Split by kind"):
 *  - Tabs by kind: Letters (Drafts, Sent, Received) and Canvases (Mine, Shared with me). One list at a time.
 *  - Inbox rows about activity on YOUR letters (completed, reading, responded) never become rows and
 *    never count as unread; they join onto the matching sent letter's "N of M done".
 *  - One meta line per row, `[state] · [one fact] · [time]` (Letters parity). Words, never a row dot, for
 *    activity on your own letters ("1 new from Tom"); "done" is the vocabulary everywhere.
 *  - A row dot exists only on Received and Shared with me. The list chips and the tabs carry a dot too:
 *    Sent while any sent letter has something new, a tab when one of its lists has a dot.
 *  - No row menu: a tap opens the item and its actions live inside it.
 */
import { formatTimeAgo } from '@/app/utils/format-time';
import { newCountForDelivery } from '@/app/utils/letter-new-activity';
import { canvasPath, canvasTitle } from '@/lib/canvas-boxes';
import type { CanvasSharedWithMe, MyCanvasRow } from '@/app/data/canvas-service';
import type { ClarityDoc, ClarityLetter, InboxItem, LetterDelivery } from '@/app/types';

export type ArtifactTab = 'letters' | 'canvases';
export type ArtifactList = 'drafts' | 'sent' | 'received' | 'mine' | 'shared';

export const ARTIFACT_TABS: readonly ArtifactTab[] = ['letters', 'canvases'];
/** The lists of each tab, in the order the filter shows them; the first is the default. */
export const TAB_LISTS: Record<ArtifactTab, readonly ArtifactList[]> = {
  letters: ['drafts', 'sent', 'received'],
  canvases: ['mine', 'shared'],
};

export const DEFAULT_LIST: Record<ArtifactTab, ArtifactList> = { letters: 'drafts', canvases: 'mine' };

export type ArtifactState = 'draft' | 'sent' | 'canvas' | 'received-letter' | 'received-canvas';

export interface ArtifactRow {
  /** Unique across all lists, e.g. `draft:<docId>`. */
  key: string;
  kind: 'letter' | 'canvas';
  list: ArtifactList;
  state: ArtifactState;
  title: string;
  /** The ONE meta line. */
  meta: string;
  /** Own items only (null on Shared with you). */
  visibility: 'public' | 'private' | null;
  /** Received and Shared with me only; always false elsewhere. */
  unread: boolean;
  /** A sent letter with new activity from a recipient: lights the Sent chip, never a row dot. */
  hasNew: boolean;
  /** Where a tap goes: the item's existing page. Null when it cannot be built (no handle yet). */
  href: string | null;
  /** Newest first within a list. */
  sortAt: number;
  ref: {
    docId?: string;
    letterId?: string;
    deliveryId?: string;
    canvasName?: string;
    ownerId?: string;
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

export type ArtifactsModel = Record<ArtifactList, ArtifactRow[]>;

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

/** A person in the meta line is a first name only ("Tom"), so the line stays on one row; no usable name reads "someone". */
export function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || 'someone';
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
  /** One first name per delivery with something new ("someone" when unnamed): not deduplicated, so two Toms are 2 people. */
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
  const from = `From ${firstName(item.actor_name)}`;
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
  const from = `From ${firstName(fromName)}`;
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
    list: 'drafts',
    state: 'draft',
    title: doc.title,
    meta: draftMeta({ updatedAt: doc.updated_at, stories: doc.story_count, points: doc.point_count, sentCount }),
    visibility: doc.visibility === 'public' ? 'public' : 'private',
    unread: false,
    hasNew: false,
    href: `/letters/drafts/${doc.id}`,
    sortAt: ms(doc.updated_at),
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
  const newFrom = withNew.map(d => firstName(d.receiver_name));
  // While something is new the row's time is the latest unread activity, not the sealing.
  const latestActivity = withNew.reduce((t, d) => Math.max(t, ms(activityByDelivery[d.id])), 0);
  const base = letter.sealed_at ?? letter.created_at;
  const shownAt = latestActivity > 0 ? new Date(latestActivity).toISOString() : base;
  return {
    key: `sent:${letter.id}`,
    kind: 'letter',
    list: 'sent',
    state: 'sent',
    title: letter.doc_title,
    meta: sentMeta({ isPublic, recipientCount, doneCount: done, newCount, newFrom, sealedAt: shownAt }),
    visibility: isPublic ? 'public' : 'private',
    unread: false,
    hasNew: newCount > 0,
    href: `/letter/${letter.id}/overview`,
    sortAt: ms(shownAt),
    ref: { letterId: letter.id },
  };
}

export function ownCanvasRow(c: MyCanvasRow, userSlug: string | null): ArtifactRow {
  return {
    key: `canvas:${c.name}`,
    kind: 'canvas',
    list: 'mine',
    state: 'canvas',
    title: canvasTitle(c.name),
    meta: canvasMeta(c.lastEdit),
    visibility: c.generalAccess === 'link' ? 'public' : 'private',
    unread: false,
    hasNew: false,
    href: userSlug ? canvasPath(userSlug, c.name) : null,
    sortAt: ms(c.lastEdit),
    ref: { canvasName: c.name },
  };
}

export function receivedLetterRow(item: InboxItem): ArtifactRow {
  return {
    key: `received:${item.delivery_id}`,
    kind: 'letter',
    list: 'received',
    state: 'received-letter',
    title: item.title,
    meta: receivedLetterMeta(item),
    visibility: null,
    unread: !item.read_at,
    hasNew: false,
    // A finished letter goes straight to its results; an open one to the reading flow (inbox-tab.tsx).
    href: item.completed_at
      ? `/letter/${item.letter_id}/results?delivery=${item.delivery_id}`
      : `/letter/${item.delivery_id}`,
    sortAt: ms(item.timestamp),
    ref: { deliveryId: item.delivery_id, letterId: item.letter_id },
  };
}

export function receivedCanvasRow(c: CanvasSharedWithMe): ArtifactRow {
  return {
    key: `shared-canvas:${c.canvasId}`,
    kind: 'canvas',
    list: 'shared',
    state: 'received-canvas',
    title: canvasTitle(c.name),
    meta: sharedMeta(c.ownerName, c.sharedAt),
    visibility: null,
    unread: c.unread,
    hasNew: false,
    href: c.ownerSlug ? canvasPath(c.ownerSlug, c.name) : null,
    sortAt: ms(c.sharedAt),
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
  return {
    drafts: src.docs.map(d => draftRow(d, sentCounts[d.id] ?? 0)).sort(newestFirst),
    sent: src.sentLetters
      .map(l => sentRow(l, src.deliveriesByLetter[l.id] ?? [], replied[l.id] ?? 0, src.newByDelivery, activity))
      .sort(newestFirst),
    received: receivedInboxItems(src.inbox).map(receivedLetterRow).sort(newestFirst),
    mine: src.myCanvases.map(c => ownCanvasRow(c, src.userSlug)).sort(newestFirst),
    shared: src.sharedCanvases.map(receivedCanvasRow).sort(newestFirst),
  };
}

// ---------------------------------------------------------------------------------------------
// Search and dots
// ---------------------------------------------------------------------------------------------

/** Title search, case-insensitive, whitespace-trimmed. An empty query keeps every row. */
export function filterByQuery(rows: ArtifactRow[], query: string): ArtifactRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(r => r.title.toLowerCase().includes(q));
}

/**
 * Whether a list's chip carries a dot: Received and Shared with me while a row is unread (minus keys the person has
 * already opened on this page), Sent while a sent letter has something new. Drafts and Mine never do.
 */
export function listHasDot(list: ArtifactList, rows: ArtifactRow[], openedKeys: ReadonlySet<string> = new Set()): boolean {
  if (list === 'received' || list === 'shared') return rows.some(r => r.unread && !openedKeys.has(r.key));
  if (list === 'sent') return rows.some(r => r.hasNew);
  return false;
}

/** A tab carries a dot when one of its lists does. */
export function tabHasDot(tab: ArtifactTab, model: ArtifactsModel, openedKeys: ReadonlySet<string> = new Set()): boolean {
  return TAB_LISTS[tab].some(list => listHasDot(list, model[list], openedKeys));
}

// ---------------------------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------------------------

export interface ArtifactsLocation {
  tab: ArtifactTab;
  list: ArtifactList;
  /** The URL used the old `tab=yours|shared` / `type=` scheme: the page rewrites it to `canonical`, replacing history. */
  legacy: boolean;
  /** The same URL in the current scheme (unrelated params kept). */
  canonical: URLSearchParams;
}

function parseTab(raw: string | null): ArtifactTab {
  return raw === 'canvases' ? 'canvases' : 'letters';
}

function parseList(tab: ArtifactTab, raw: string | null): ArtifactList {
  const lists = TAB_LISTS[tab];
  return lists.find(l => l === raw) ?? DEFAULT_LIST[tab];
}

/**
 * Reads the tab and list from the URL: `?tab=letters|canvases` (default letters) and `&list=` (default: the tab's first).
 * Old links keep working: `tab=yours` is Drafts (Mine with `type=canvases`), `tab=shared` is Received (Shared with me
 * with `type=canvases`), and a bare `type=` follows the old default tab, yours.
 */
export function resolveArtifactsLocation(params: URLSearchParams): ArtifactsLocation {
  const rawTab = params.get('tab');
  const type = params.get('type');
  const legacy = rawTab === 'yours' || rawTab === 'shared' || (rawTab === null && type !== null);
  let tab: ArtifactTab;
  let list: ArtifactList;
  if (legacy) {
    tab = type === 'canvases' ? 'canvases' : 'letters';
    const incoming = rawTab === 'shared';
    list = tab === 'canvases' ? (incoming ? 'shared' : 'mine') : (incoming ? 'received' : 'drafts');
  } else {
    tab = parseTab(rawTab);
    list = parseList(tab, params.get('list'));
  }
  const canonical = new URLSearchParams(params);
  if (legacy) {
    canonical.set('tab', tab);
    canonical.set('list', list);
    canonical.delete('type');
  }
  return { tab, list, legacy, canonical };
}
