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
 *    never count as unread; they join onto the matching sent letter's "N replied".
 *  - One meta line per row; no recipients, no counts of stories or points, no second timestamp.
 *  - An unread mark exists only on Shared with you.
 */
import { formatTimeAgo } from '@/app/utils/format-time';
import { canvasPath } from '@/lib/canvas-boxes';
import type { CanvasSharedWithMe, MyCanvasRow } from '@/app/data/canvas-service';
import type { ClarityDoc, ClarityLetter, InboxItem, LetterDelivery } from '@/app/types';

export type ArtifactTab = 'yours' | 'shared';
export type ArtifactTypeFilter = 'all' | 'letters' | 'canvases';

export const ARTIFACT_TABS: readonly ArtifactTab[] = ['yours', 'shared'];
export const ARTIFACT_TYPE_FILTERS: readonly ArtifactTypeFilter[] = ['all', 'letters', 'canvases'];

export type ArtifactState = 'draft' | 'sent' | 'canvas' | 'received-letter' | 'received-canvas';

/** What the "…" menu can hold. The page maps each id to its handler; the model decides which apply. */
export type RowActionId =
  | 'prepare-letter'
  | 'delete-draft'
  | 'preview-letter'
  | 'add-recipients'
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
    sourceDocId?: string;
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

/** "Draft · edited 2h ago". */
export function draftMeta(updatedAt: string): string {
  const ago = agoPhrase(updatedAt);
  return ago ? `Draft · edited ${ago}` : 'Draft';
}

/** "Sent to 3 · 1 replied", "Public link · 2 replied". No replies yet: the reply part is dropped. */
export function sentMeta(opts: { isPublic: boolean; recipientCount: number; repliedCount: number }): string {
  const parts: string[] = [];
  if (opts.isPublic) parts.push('Public link');
  if (opts.recipientCount > 0) parts.push(`Sent to ${opts.recipientCount}`);
  if (parts.length === 0) parts.push('No recipients yet');
  if (opts.repliedCount > 0) parts.push(`${opts.repliedCount} replied`);
  return parts.join(' · ');
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

/** The title shown for a canvas: its hashtag-shaped name, underscores read as spaces. */
export function canvasTitle(name: string): string {
  return name.replace(/_/g, ' ');
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
 * Replies per sent letter: deliveries that completed, unioned by delivery id with the completed
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

export function draftRow(doc: ClarityDoc): ArtifactRow {
  return {
    key: `draft:${doc.id}`,
    kind: 'letter',
    tab: 'yours',
    state: 'draft',
    title: doc.title,
    meta: draftMeta(doc.updated_at),
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

export function sentRow(letter: SentLetter, deliveries: LetterDelivery[], replied: number): ArtifactRow {
  const isPublic = letter.mode === 'one-to-many';
  const recipientCount = deliveries.filter(d => d.receiver_email).length;
  return {
    key: `sent:${letter.id}`,
    kind: 'letter',
    tab: 'yours',
    state: 'sent',
    title: letter.doc_title,
    meta: sentMeta({ isPublic, recipientCount, repliedCount: replied }),
    visibility: isPublic ? 'public' : 'private',
    unread: false,
    href: `/letter/${letter.id}/overview`,
    sortAt: ms(letter.sealed_at ?? letter.created_at),
    menu: [
      { id: 'preview-letter', label: 'Preview letter' },
      { id: 'add-recipients', label: 'Add recipient(s)' },
      ...(isPublic ? [{ id: 'copy-public-link' as const, label: 'Copy public link' }] : []),
      {
        id: 'delete-letter',
        label: 'Delete letter',
        danger: true,
        // Any delivery (recipients and link respondents) means the letter was shared.
        disabledReason: deliveries.length > 0 ? "Can't delete — letter has been shared." : undefined,
      },
    ],
    ref: { letterId: letter.id, sourceDocId: letter.source_doc_id, isPublicLetter: isPublic },
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
    meta: sharedMeta(item.actor_name, item.timestamp),
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

const newestFirst = (a: ArtifactRow, b: ArtifactRow) => b.sortAt - a.sortAt;

export function buildArtifacts(src: ArtifactsSource): ArtifactsModel {
  const replied = repliedCountByLetter(src.deliveriesByLetter, src.inbox);
  const yours = [
    ...src.docs.map(draftRow),
    ...src.sentLetters.map(l => sentRow(l, src.deliveriesByLetter[l.id] ?? [], replied[l.id] ?? 0)),
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
