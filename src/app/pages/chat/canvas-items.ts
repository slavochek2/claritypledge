/**
 * P1536: what the owner has given a canvas draft, as the rows of the pinned checklist. Pure: the rows are worked out
 * from the database's material, the owner's messages in the thread, when the last canvas was drafted, and the uploads
 * under way in this tab.
 *  - A file is "reading" while it uploads, "read" once the server kept its text, "failed" when it could not be read.
 *  - A link in the owner's own messages is "pending" until a draft run that started after it was written finished, then
 *    "read" (the run kept its text as material) or "failed" (it did not). Only a successful DRAFT run counts: a file read,
 *    a tension run, and a failed, capped or cancelled run never tried the links.
 *  - Everything else the owner wrote or copied in is one row, "N messages from you".
 */
import type { ChatMessage } from '@/app/data/chat-service';
import type { CanvasDraft, CanvasDraftRun, CanvasMaterialItem } from '@/app/data/canvas-draft-service';
import { LINK_FAILED_REASON, UPLOAD_REASON, ownerMessagesLabel } from './canvas-thread-copy';
import { copyHasText } from './use-canvas-thread';

export type RowStatus = 'reading' | 'read' | 'failed' | 'pending';

export interface CanvasItemRow {
  key: string;
  kind: 'file' | 'link' | 'notes';
  label: string;
  status: RowStatus;
  /** Why a failed row failed, in a few words. */
  reason?: string;
}

/** A file picked in this tab: it is not in the database's material until the server has read it. */
export interface UploadItem {
  key: string;
  name: string;
  status: 'reading' | 'read' | 'failed';
  code?: string;
  /** When it finished (ms), so "added since the last run" can be told. */
  at: number;
  /**
   * Once the server kept it: its label there, and the ids of the draft's files from before it went up. The entry stays
   * drawn (as read) until the material read carries a file with that label that is not among those ids, so the row never
   * goes missing between the local entry and the database's own.
   */
  label?: string;
  before?: string[];
}

/** The same links the server reads (supabase/functions/_shared/canvas-material.ts `extractUrls`). */
const URL_FIND = /\bhttps?:\/\/[^\s<>"'`]+|\bwww\.[^\s<>"'`]+/gi;

export function extractLinks(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(URL_FIND)) {
    let u = m[0].replace(/[.,;:!?)\]}]+$/, '');
    if (/^www\./i.test(u)) u = `https://${u}`;
    if (u.length <= 2000 && !out.includes(u)) out.push(u);
  }
  return out;
}

/** "example.com" for a link; the link itself, cut, when it cannot be parsed. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || url.slice(0, 40);
  } catch {
    return url.slice(0, 40);
  }
}

const owned = (m: ChatMessage, ownerId: string, rootId: string): boolean => m.authorId === ownerId && m.id !== rootId && !m.isDeleted;

export function failureReason(code: string | undefined): string | undefined {
  return code ? (UPLOAD_REASON[code] ?? 'something went wrong') : undefined;
}

/** An upload that was kept has reached the material read: a file with its label, new since it went up and not already taken by an earlier upload. */
function landed(u: UploadItem, files: CanvasMaterialItem[], taken: Set<string>): boolean {
  if (u.label === undefined) return true;
  const hit = files.find((m) => m.label === u.label && !(u.before ?? []).includes(m.id) && !taken.has(m.id));
  if (hit) taken.add(hit.id);
  return !!hit;
}

function fileRows(material: CanvasMaterialItem[], uploads: UploadItem[]): CanvasItemRow[] {
  const files = material.filter((m) => m.kind === 'file');
  const rows: CanvasItemRow[] = files.map((m) => ({ key: `file-${m.id}`, kind: 'file', label: m.label, status: 'read' }));
  const taken = new Set<string>();
  for (const u of uploads) {
    if (u.status === 'reading') rows.push({ key: u.key, kind: 'file', label: u.name, status: 'reading' });
    else if (u.status === 'failed') rows.push({ key: u.key, kind: 'file', label: u.name, status: 'failed', reason: failureReason(u.code) });
    else if (!landed(u, files, taken)) rows.push({ key: u.key, kind: 'file', label: u.name, status: 'read' });
  }
  return rows;
}

/** The links the owner wrote (url to when it was written) and how many of their messages are notes. */
function scanOwnerMessages(messages: ChatMessage[], ownerId: string, rootId: string): { links: Map<string, number>; notes: number } {
  const links = new Map<string, number>();
  let notes = 0;
  for (const m of messages) {
    if (!owned(m, ownerId, rootId)) continue;
    if (m.kind === 'message') {
      for (const u of extractLinks(m.body ?? '')) if (!links.has(u)) links.set(u, Date.parse(m.createdAt));
      if ((m.body ?? '').replace(URL_FIND, ' ').trim() !== '') notes += 1;
    } else if ((m.kind === 'clarify' || m.kind === 'forward') && copyHasText(m)) {
      notes += 1;
    }
  }
  return { links, notes };
}

function linkRows(links: Map<string, number>, material: CanvasMaterialItem[], tried: number | null): CanvasItemRow[] {
  const readLinks = new Set(material.filter((m) => m.kind === 'link').map((m) => m.label));
  const all = new Map(links);
  for (const url of readLinks) if (!all.has(url)) all.set(url, 0);
  return [...all].map(([url, at]) => {
    const status: RowStatus = readLinks.has(url.slice(0, 200)) ? 'read' : tried !== null && at <= tried ? 'failed' : 'pending';
    return { key: `link-${url}`, kind: 'link', label: linkHost(url), status, ...(status === 'failed' ? { reason: LINK_FAILED_REASON } : {}) };
  });
}

export function buildItems(args: {
  material: CanvasMaterialItem[];
  messages: ChatMessage[];
  ownerId: string;
  rootId: string;
  /** When the last successful DRAFT run began (ms), or null when none has finished. */
  lastDraftAt: number | null;
  uploads: UploadItem[];
}): CanvasItemRow[] {
  const { material, messages, ownerId, rootId, lastDraftAt, uploads } = args;
  const { links, notes } = scanOwnerMessages(messages, ownerId, rootId);
  const rows = [...fileRows(material, uploads), ...linkRows(links, material, lastDraftAt)];
  if (notes > 0) rows.push({ key: 'notes', kind: 'notes', label: ownerMessagesLabel(notes), status: 'pending' });
  return rows;
}

/** There is something a run could use: a file that was read, a link, or a note. Rows still reading or failed do not count. */
export const hasUsableItems = (rows: CanvasItemRow[]): boolean => rows.some((r) => r.status === 'read' || r.status === 'pending');

/**
 * The owner added something after the last successful draft run began: a note, a link, a copy, a file kept (read from the
 * database's own time, so it holds after a reload) or a file read in this tab. A link the run itself kept is not new.
 */
export function hasNewSinceRun(args: { messages: ChatMessage[]; ownerId: string; rootId: string; lastDraftAt: number | null; material: CanvasMaterialItem[]; uploads: UploadItem[] }): boolean {
  const since = args.lastDraftAt;
  if (since === null) return false;
  if (args.uploads.some((u) => u.status === 'read' && u.at > since)) return true;
  if (args.material.some((m) => m.kind === 'file' && Date.parse(m.createdAt) > since)) return true;
  return args.messages.some((m) => {
    if (!owned(m, args.ownerId, args.rootId) || !(Date.parse(m.createdAt) > since)) return false;
    return m.kind === 'message' ? (m.body ?? '').trim() !== '' : (m.kind === 'clarify' || m.kind === 'forward') && copyHasText(m);
  });
}

/**
 * A discard is on offer (the header's "…" menu) for an open draft with something to throw away, an item, a note or a run,
 * and never while a run or a request of its own goes.
 */
export function canDiscardDraft(p: { draft: Pick<CanvasDraft, 'state' | 'runCount'>; run: CanvasDraftRun | null; running: boolean; busy: unknown; items: CanvasItemRow[] }): boolean {
  return p.draft.state === 'open' && !p.running && !p.busy && (p.items.length > 0 || p.run !== null || p.draft.runCount > 0);
}

/**
 * What decides which tray control is on offer, from one place: the tray (canvas-thread.tsx) and the draft card read these.
 * `BarProps` satisfies it. A control's LOOK never depends on what the owner is typing (design-system rule 9).
 */
interface BarFacts {
  draft: Pick<CanvasDraft, 'state' | 'runCount'>;
  items: CanvasItemRow[];
  /** Something was added after the newest finished run. */
  newInput?: boolean;
  /** False when the newest run failed and no draft run ever finished. */
  draftHasPoints?: boolean;
  running?: boolean;
  /** A request of the bar's own is in flight. */
  busy?: unknown;
}

/** A canvas exists to look at and publish: a draft run finished and counted. */
export const isDone = ({ draft, draftHasPoints = true }: BarFacts): boolean => draft.runCount > 0 && draftHasPoints;

/** A file is being read: no run action meanwhile, a run started now would go without it. */
export const isReading = ({ items }: BarFacts): boolean => items.some((i) => i.kind === 'file' && i.status === 'reading');

/** The tray's create action is on offer: something usable was added, a canvas is not made yet or has new input, no file is mid-read. */
export const actionOffered = (f: BarFacts): boolean => (!isDone(f) || !!f.newInput) && !isReading(f) && hasUsableItems(f.items);

/** A finished draft got new input and "Update draft" is offered: it is the one primary, and the card's Open steps back. */
export const updateOffered = (f: BarFacts): boolean => isDone(f) && actionOffered(f);

