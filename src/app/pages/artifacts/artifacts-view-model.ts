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
 *    never count as unread; they join onto the matching sent letter's "N of M done". What is NEW on a sent
 *    letter comes from its deliveries (started or finished, still unread), never from the capped inbox.
 *  - One meta line per row, `[state] · [one fact] · [time]`. A sent letter names who it went to ("To Anna, Tom",
 *    "To Tom + 2 others"), then "N new" or, for a public link, "N finished"; a received letter says "Finished" once done.
 *  - A row dot exists only on Received and Shared with me. The list chips and the tabs carry a dot too:
 *    Sent while any sent letter has something new, a tab when one of its lists has a dot.
 *  - Rows carry their own buttons (the row body is not a link); every dot reads `unread` (received) or `hasNew` (sent).
 */
import { formatTimeAgo } from '@/app/utils/format-time';
import { hasNewSenderProgress, newCountForDelivery } from '@/app/utils/letter-new-activity';
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
    /** Draft: stories in it (Prepare letter needs one) and whether letters were sent from it (Delete is blocked). */
    storyCount?: number;
    hasSentLetters?: boolean;
    letterId?: string;
    /** Sent letter: the draft it was sealed from (Preview), who it went to, and which of them are new. */
    sourceDocId?: string | null;
    isPublicLetter?: boolean;
    /** How many deliveries it has, public-link respondents included (Delete letter needs 0). */
    deliveryCount?: number;
    newDeliveryIds?: string[];
    deliveryId?: string;
    canvasName?: string;
    ownerId?: string;
    /** Own canvas: its sharing (Copy link needs it shared). */
    generalAccess?: 'restricted' | 'link';
    hasAudience?: boolean;
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
  /** The signed-in person's id: their own name in a meta line reads "you". */
  userId?: string | null;
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

/** A person in the meta line: the full display name, "you" for the viewer, "someone" when there is no usable name. */
export function personName(name: string | null | undefined, isViewer = false): string {
  return isViewer ? 'you' : name?.trim() || 'someone';
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** `[state] · [fact] · [time]`: empty parts are dropped. */
function joinMeta(parts: (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => !!p).join(' · ');
}

/**
 * "3 stories, 5 points · 2h ago" (the Drafts chip already says Draft); a draft already sent:
 * "3 stories, 5 points · used for 2 letters · 2h ago". Always ends with the time.
 */
export function draftMeta(opts: { updatedAt: string; stories: number; points: number; sentCount?: number }): string {
  const counts = `${plural(opts.stories, 'story', 'stories')}, ${plural(opts.points, 'point', 'points')}`;
  const used = opts.sentCount && opts.sentCount > 0 ? `used for ${plural(opts.sentCount, 'letter', 'letters')}` : null;
  return joinMeta([counts, used, agoPhrase(opts.updatedAt)]);
}

/**
 * Who a private letter went to: "To Anna Test, Tom Test" (one or two names in full), "To Tom Test + 2 others" (three or
 * more: the first name and a count), "No recipients yet". A public letter says "Public link".
 * The fact slot holds the progress ("1 of 2 finished"; a public letter: "4 finished"), which gives way to the news while
 * something is new ("1 new from Tom Test", "2 new from 2 people"; public: "1 new"). The time comes last:
 * "To Anna Test, Tom Test · 1 of 2 finished · 2d ago", "Public link · 4 finished · 2d ago".
 */
export function sentMeta(opts: {
  isPublic: boolean;
  /** One display name per recipient (a delivery with an email), in the order they were added. */
  recipientNames: string[];
  doneCount: number;
  newCount?: number;
  /** One name per delivery with something new ("you" for the viewer): not deduplicated, so two Toms are 2 people. */
  newFrom?: string[];
  sealedAt?: string | null;
}): string {
  const names = opts.recipientNames;
  const state = opts.isPublic
    ? 'Public link'
    : names.length === 0
      ? 'No recipients yet'
      : names.length <= 2
        ? `To ${names.join(', ')}`
        : `To ${names[0]} + ${names.length - 1} others`;
  let fact: string | null = null;
  if (opts.newCount && opts.newCount > 0) {
    const who = opts.newFrom ?? [];
    // One recipient: the state already names them, so "To Tom · 1 new", never "To Tom · 1 new from Tom".
    fact = opts.isPublic || who.length === 0 || names.length === 1 ? `${opts.newCount} new` : `${opts.newCount} new from ${who.length === 1 ? who[0] : `${who.length} people`}`;
  } else if (opts.isPublic) {
    fact = `${opts.doneCount} finished`;
  } else if (names.length > 0) {
    fact = `${Math.min(opts.doneCount, names.length)} of ${names.length} finished`;
  }
  return joinMeta([state, fact, agoPhrase(opts.sealedAt)]);
}

/** "From Tom · 2 of 5 steps · 4d ago"; finished: "From Anna · Finished · 1w ago"; your own letter: "From you · …". */
export function receivedLetterMeta(item: InboxItem, fromViewer = false): string {
  const from = `From ${personName(item.actor_name, fromViewer)}`;
  let fact: string | null = null;
  if (item.completed_at) fact = 'Finished';
  else if (item.total_steps !== undefined) fact = `${Math.min(item.steps_completed ?? 0, item.total_steps)} of ${item.total_steps} steps`;
  return joinMeta([from, fact, agoPhrase(item.timestamp)]);
}

/** "Edited 3d ago"; a canvas with no known edit just says "Canvas". */
export function canvasMeta(lastEdit: string | null): string {
  const ago = agoPhrase(lastEdit);
  return ago ? `Edited ${ago}` : 'Canvas';
}

/** "From Mara · 1h ago". */
export function sharedMeta(fromName: string | null | undefined, at: string, fromViewer = false): string {
  const ago = agoPhrase(at);
  const from = `From ${personName(fromName, fromViewer)}`;
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
    ref: { docId: doc.id, storyCount: doc.story_count, hasSentLetters: doc.has_sent_letters },
  };
}

export function sentRow(
  letter: SentLetter,
  deliveries: LetterDelivery[],
  done: number,
  newByDelivery: Record<string, number> = {},
  activityByDelivery: Record<string, string> = {},
  viewerId: string | null = null,
): ArtifactRow {
  const isPublic = letter.mode === 'one-to-many';
  const recipientNames = deliveries
    .filter(d => d.receiver_email)
    .map(d => personName(d.receiver_name?.trim() || d.receiver_email, !!viewerId && d.receiver_profile_id === viewerId));
  const newOf = (d: LetterDelivery) => newCountForDelivery(newByDelivery[d.id] ?? 0, d.id in activityByDelivery);
  const withNew = deliveries.filter(d => newOf(d) > 0);
  const newCount = withNew.reduce((n, d) => n + newOf(d), 0);
  const newFrom = withNew.map(d => personName(d.receiver_name?.trim() || d.receiver_email, !!viewerId && d.receiver_profile_id === viewerId));
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
    meta: sentMeta({ isPublic, recipientNames, doneCount: done, newCount, newFrom, sealedAt: shownAt }),
    visibility: isPublic ? 'public' : 'private',
    unread: false,
    hasNew: newCount > 0,
    href: `/letter/${letter.id}/overview`,
    sortAt: ms(shownAt),
    ref: {
      letterId: letter.id,
      sourceDocId: letter.source_doc_id ?? null,
      isPublicLetter: isPublic,
      deliveryCount: deliveries.length,
      newDeliveryIds: withNew.map(d => d.id),
    },
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
    ref: { canvasName: c.name, generalAccess: c.generalAccess, hasAudience: c.hasAudience },
  };
}

export function receivedLetterRow(item: InboxItem, viewerSlug: string | null = null): ArtifactRow {
  return {
    key: `received:${item.delivery_id}`,
    kind: 'letter',
    list: 'received',
    state: 'received-letter',
    title: item.title,
    meta: receivedLetterMeta(item, !!viewerSlug && item.actor_slug === viewerSlug),
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

export function receivedCanvasRow(c: CanvasSharedWithMe, viewerId: string | null = null): ArtifactRow {
  return {
    key: `shared-canvas:${c.canvasId}`,
    kind: 'canvas',
    list: 'shared',
    state: 'received-canvas',
    title: canvasTitle(c.name),
    meta: sharedMeta(c.ownerName, c.sharedAt, !!viewerId && c.ownerId === viewerId),
    visibility: null,
    unread: c.unread,
    hasNew: false,
    href: c.ownerSlug ? canvasPath(c.ownerSlug, c.name) : null,
    sortAt: ms(c.sharedAt),
    ref: { canvasName: c.name, ownerId: c.ownerId },
  };
}

/**
 * Unread sender-side activity per delivery id, read from the deliveries themselves (get_deliveries_with_progress):
 * the recipient started or finished and the sender has not seen the latest of it (the sender's own mark, not the
 * recipient's `read_at`; see hasNewSenderProgress). The time is the latest progress. Deliveries to the viewer themself never count (the
 * RPC excludes them). Deriving this from the deliveries, not from the inbox, keeps it clear of that list's 20-row
 * cap, which twenty newer received letters could fill.
 */
export function unreadActivityByDelivery(
  deliveriesByLetter: Record<string, LetterDelivery[]>,
  viewerId: string | null = null,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const deliveries of Object.values(deliveriesByLetter)) {
    for (const d of deliveries) {
      if (!hasNewSenderProgress(d)) continue;
      if (viewerId && d.receiver_profile_id === viewerId) continue;
      out[d.id] = d.last_progress_at ?? d.completed_at ?? d.created_at;
    }
  }
  return out;
}

const newestFirst = (a: ArtifactRow, b: ArtifactRow) => b.sortAt - a.sortAt;

export function buildArtifacts(src: ArtifactsSource): ArtifactsModel {
  const replied = repliedCountByLetter(src.deliveriesByLetter, src.inbox);
  const sentCounts: Record<string, number> = {};
  for (const l of src.sentLetters) sentCounts[l.source_doc_id] = (sentCounts[l.source_doc_id] ?? 0) + 1;
  const activity = unreadActivityByDelivery(src.deliveriesByLetter, src.userId ?? null);
  return {
    drafts: src.docs.map(d => draftRow(d, sentCounts[d.id] ?? 0)).sort(newestFirst),
    // Letters with something new first (newest activity first), then the rest newest first. The words "N new from …"
    // stay on the row and there is no row dot, so the Sent chip's dot is explained by what sits at the top.
    sent: src.sentLetters
      .map(l => sentRow(l, src.deliveriesByLetter[l.id] ?? [], replied[l.id] ?? 0, src.newByDelivery, activity, src.userId ?? null))
      .sort((a, b) => Number(b.hasNew) - Number(a.hasNew) || newestFirst(a, b)),
    received: receivedInboxItems(src.inbox).map(i => receivedLetterRow(i, src.userSlug)).sort(newestFirst),
    mine: src.myCanvases.map(c => ownCanvasRow(c, src.userSlug)).sort(newestFirst),
    shared: src.sharedCanvases.map(c => receivedCanvasRow(c, src.userId ?? null)).sort(newestFirst),
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
