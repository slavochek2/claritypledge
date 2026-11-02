/**
 * @file canvas-root-store.ts
 * @description P1536 3c X10/X11 (review round 2): what EVERY canvas thread root of a chat knows about its draft, from ONE batched read, shared by the card and the "N replies"
 * link of each root. Replaces a read per card and per link (50 to 60 requests on one tab return at 10 cards).
 *
 * Request cost (metered-services rules 2 to 4; the numbers are pinned by p1536-x11-root-store.test.ts):
 *  - mount, N cards: ONE query for all N drafts (`thread_root_id` in a list) + ONE for the viewer's versions (the cards' detail) = 2 requests whatever N is;
 *    +1 for the viewer's slug only when the chat does not know it, +1 for the owner's canvases only when a card has no published version to take its title from.
 *  - tab return, nothing changed: ONE query, for the roots that can still change (an open draft, or none read yet). A closed draft never changes again and is not asked about.
 *  - a draft changed state: its detail comes with that same flush: +1 request (the versions) for any number of changes. Only a root whose state changed gets its detail again.
 *  - a hidden tab makes ZERO requests, on mount too: what is due waits and is read when the tab returns. No timer, no polling, no retry loop (a failure waits for the next signal).
 * Signals: a slot appearing, the tab becoming visible, a reply arriving on a root (its count), the same-tab canvas event for a draft, a rename (detail), the person's Retry.
 *
 * This is NOT the in-flight request dedupe decisions.md 2026-10-21 (P1527) rejected. Nothing here answers a read from an earlier answer: every flush is a FRESH query, and the
 * only thing shared is the moment of asking (the cards of one chat mount together, so they are asked in one query). That entry endorses the change of query shape ("the side rail
 * reads all its groups' upcoming events in one `.in('org_id')` query"); it does not mention coalescing the asks of several consumers, so this reading is the author's, not its text.
 * Answers kept here live only while a card or link of that root is mounted, are replaced by the next signal's read, and an older answer never replaces a newer one.
 */
import { cardNeedsCanvasTitle, getCanvasDraftsByThreads, getProfileSlug, listMyCanvasVersions, type CanvasDraft, type CanvasVersionOption } from '@/app/data/canvas-draft-service';
import { listMyCanvases } from '@/app/data/canvas-artifacts';
import { subscribeCanvasDraftEvents } from '@/app/data/canvas-draft-events';

/** The longest a tap waits for the current state before it acts on what is known (short: the person is waiting, and a link has the known address to fall back on). */
export const TAP_READ_MAX_MS = 1_500;

export interface RootDetail {
  versions: CanvasVersionOption[];
  slug: string | null;
  titles: Map<string, string | null | undefined>;
}

/** `pending`: not read yet (or nothing asked: hidden tab). `failed`: the first read was refused. `ready` with `draft` null: no draft this viewer can read. */
export interface RootSnap {
  status: 'pending' | 'failed' | 'ready';
  draft: CanvasDraft | null;
  detail: RootDetail | null;
}

const PENDING: RootSnap = { status: 'pending', draft: null, detail: null };

interface Slot {
  rootId: string;
  viewerId: string;
  slug: string | null;
  refs: number;
  listeners: Set<() => void>;
  snap: RootSnap;
  dirty: boolean;
  needDetail: boolean;
  count: number | undefined;
  /** Every read of this root takes the next number; only a read newer than the newest applied one may write. */
  issued: number;
  applied: number;
}

const slots = new Map<string, Slot>();
let timer: ReturnType<typeof setTimeout> | null = null;
let teardown: (() => void) | null = null;

const tabIsVisible = (): boolean => typeof document === 'undefined' || document.visibilityState !== 'hidden';
const canChange = (s: Slot): boolean => !s.snap.draft || s.snap.draft.state === 'open';
const sameDraft = (a: CanvasDraft | null, b: CanvasDraft | null): boolean => a === b || (!!a && !!b && a.id === b.id && a.state === b.state && a.canvasName === b.canvasName && a.versionName === b.versionName && a.versionId === b.versionId);

function notify(s: Slot): void {
  for (const l of [...s.listeners]) l();
}

function schedule(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, 0); // the cards of one chat mount in one commit: asking in the next tick makes them one query
}

/** A signal says what is shown MAY be out of date: every root that can still change is due. */
function dueAll(): void {
  for (const s of slots.values()) if (canChange(s)) s.dirty = true;
  schedule();
}

function install(): void {
  if (teardown) return;
  const onVisible = () => {
    if (tabIsVisible()) dueAll();
  };
  document.addEventListener('visibilitychange', onVisible);
  const off = subscribeCanvasDraftEvents((e) => {
    if (e.kind === 'updated') return; // points changed, not what the draft is
    for (const s of slots.values()) if (s.snap.draft?.id === e.draftId && canChange(s)) s.dirty = true;
    schedule();
  });
  teardown = () => {
    document.removeEventListener('visibilitychange', onVisible);
    off();
    teardown = null;
  };
}

export function acquireRoot(args: { rootId: string; viewerId: string; slug: string | null | undefined; count?: number }): () => void {
  let s = slots.get(args.rootId);
  if (!s) {
    s = { rootId: args.rootId, viewerId: args.viewerId, slug: null, refs: 0, listeners: new Set(), snap: PENDING, dirty: true, needDetail: false, count: args.count, issued: 0, applied: 0 };
    slots.set(args.rootId, s);
    install();
    schedule();
  }
  s.refs += 1;
  if (args.slug) s.slug = args.slug;
  const mine = s;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    mine.refs -= 1;
    if (mine.refs > 0 || slots.get(mine.rootId) !== mine) return;
    slots.delete(mine.rootId);
    if (slots.size === 0) teardown?.();
  };
}

export function subscribeRoot(rootId: string, listener: () => void): () => void {
  const s = slots.get(rootId);
  s?.listeners.add(listener);
  return () => s?.listeners.delete(listener);
}

export const rootSnapshot = (rootId: string): RootSnap => slots.get(rootId)?.snap ?? PENDING;

export function setRootSlug(rootId: string, slug: string | null | undefined): void {
  const s = slots.get(rootId);
  if (s && slug) s.slug = slug;
}

/** A reply arrived on this root (its count changed): the Publish reply is one. The first value is not a change. */
export function touchRootCount(rootId: string, count: number): void {
  const s = slots.get(rootId);
  if (!s) return;
  const changed = s.count !== undefined && s.count !== count;
  const before = s.count;
  s.count = count;
  // Counts that arrive before the first answer are the chat's stats loading (messages and their reply counts load separately), not replies: the first read is fresher than any of them.
  if (!changed || s.snap.status !== 'ready' || before === undefined || !canChange(s)) return;
  s.dirty = true;
  schedule();
}

/** A rename of the canvas: the card's title lives in the detail, which is read again with the next flush. */
export function invalidateRootDetail(rootId: string): void {
  const s = slots.get(rootId);
  if (!s) return;
  s.needDetail = true;
  s.dirty = true;
  schedule();
}

/** The person's Retry: read again, whatever state it was in. */
export function retryRoot(rootId: string): void {
  const s = slots.get(rootId);
  if (!s) return;
  s.dirty = true;
  schedule();
}

const needsDetail = (s: Slot, draft: CanvasDraft | null): boolean =>
  !!draft && (s.needDetail || !s.snap.detail || !s.snap.draft || s.snap.draft.state !== draft.state || s.snap.draft.id !== draft.id);

/** What the cards need besides the drafts, read ONCE for every root that needs it. */
async function readDetail(targets: Slot[], drafts: Map<string, CanvasDraft>): Promise<RootDetail> {
  const versions = await listMyCanvasVersions();
  const known = targets.find((s) => s.slug)?.slug ?? null;
  const first = targets[0];
  const slug = known ?? (first ? await getProfileSlug(first.viewerId, 'canvas root store').catch(() => null) : null);
  const names = new Set<string>();
  for (const s of targets) {
    const d = drafts.get(s.rootId);
    if (d && d.canvasName && cardNeedsCanvasTitle(d, versions)) names.add(d.canvasName);
  }
  const titles = new Map<string, string | null | undefined>();
  if (names.size > 0) {
    const rows = await listMyCanvases().catch(() => []);
    for (const n of names) titles.set(n, rows.find((r) => r.name === n)?.title);
  }
  return { versions, slug, titles };
}

/** A refused read: the first value is `failed`; a value already known is kept. */
function fail(s: Slot, seq: number): void {
  if (seq < s.applied) return;
  s.applied = seq;
  if (s.snap.status === 'ready') return;
  s.snap = { ...s.snap, status: 'failed' };
  notify(s);
}

function commit(s: Slot, seq: number, draft: CanvasDraft | null, detail: RootDetail | null): void {
  if (seq < s.applied) return; // an older answer never replaces a newer one
  s.applied = seq;
  const next: RootSnap = { status: 'ready', draft, detail: detail ?? s.snap.detail };
  if (detail) s.needDetail = false;
  const prev = s.snap;
  if (prev.status === 'ready' && sameDraft(prev.draft, next.draft) && prev.detail === next.detail) return; // nothing changed: nothing re-renders
  s.snap = next;
  notify(s);
}

async function flush(): Promise<void> {
  if (!tabIsVisible()) return; // zero requests while hidden; what is due waits for the tab to return
  const targets = [...slots.values()].filter((s) => s.dirty);
  if (targets.length === 0) return;
  const seqs = new Map<Slot, number>();
  for (const s of targets) {
    s.dirty = false;
    s.issued += 1;
    seqs.set(s, s.issued);
  }
  let drafts: Map<string, CanvasDraft>;
  try {
    drafts = await getCanvasDraftsByThreads(targets.map((s) => s.rootId));
  } catch {
    for (const s of targets) fail(s, seqs.get(s) ?? 0);
    return;
  }
  const detailTargets = targets.filter((s) => needsDetail(s, drafts.get(s.rootId) ?? null));
  let detail: RootDetail | null = null;
  if (detailTargets.length > 0) {
    try {
      detail = await readDetail(detailTargets, drafts);
    } catch {
      // the detail could not be read: what changed is not applied (the card would be wrong), and the next signal reads it again
      for (const s of detailTargets) {
        s.needDetail = true;
        fail(s, seqs.get(s) ?? 0);
      }
    }
  }
  for (const s of targets) {
    const failedDetail = detailTargets.includes(s) && !detail;
    if (!failedDetail) commit(s, seqs.get(s) ?? 0, drafts.get(s.rootId) ?? null, detailTargets.includes(s) ? detail : null);
  }
}

const withDeadline = <T,>(read: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('read deadline')), ms);
    read.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e: unknown) => { clearTimeout(t); reject(e instanceof Error ? e : new Error(String(e))); },
    );
  });

/**
 * The CURRENT draft of one root, read at the moment of a tap. It follows the newest answer: if a newer read (a signal's flush) was applied while this one was out, its result
 * decides, never this superseded one. A refused or stalled read (TAP_READ_MAX_MS) answers what is known. `null`: no draft this viewer can read (gone since it was drawn).
 */
export async function readRootNow(rootId: string, ms: number): Promise<CanvasDraft | null> {
  const s = slots.get(rootId);
  if (!s) return null;
  s.issued += 1;
  const mine = s.issued;
  let got: CanvasDraft | null;
  try {
    got = (await withDeadline(getCanvasDraftsByThreads([rootId]), ms)).get(rootId) ?? null;
  } catch {
    return s.snap.draft;
  }
  if (mine < s.applied) return s.snap.draft;
  s.applied = mine;
  if (!sameDraft(s.snap.draft, got)) {
    s.dirty = true; // what is drawn is behind: the flush brings it, with the detail
    schedule();
  }
  return got;
}

/** For tests: forget everything. */
export function resetCanvasRootStore(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  slots.clear();
  teardown?.();
}
