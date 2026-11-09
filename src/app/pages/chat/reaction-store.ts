/**
 * @file reaction-store.ts
 * @description P1652: the reactions of the messages on screen. A row watches its message; the first watcher opens ONE realtime subscription and
 * the last one (after a short grace) closes it and forgets everything.
 *  - Each reaction keeps its generated id with its message and emoji, so a live removal (which carries only that id) can be applied.
 *  - A removal for an id this store does not hold is a no-op: it cannot match anything drawn, and a reconnect heals any drift.
 *  - Every (re)subscribe re-reads the watched messages (at most one read in flight plus one queued, none while the tab is hidden: one read when
 *    it becomes visible), so a session that was offline during a removal shows the right count after reconnecting.
 *  - A tap is optimistic and rolls back when the write fails (the caller shows the error). Writes are serialised per (message, emoji) and the
 *    latest intent wins: on then off while the add is in flight ends removed, on the server and on screen.
 *  - Another viewer (sign-out, account switch) never sees the previous viewer's rows: the store is cleared when the viewer changes.
 * Reactions are never read by the mirror agent, change no unread count and notify nobody: this store touches nothing else.
 */
import { addReaction, listReactions, removeReaction, subscribeToReactions, type ChatReaction } from '@/app/data/chat-reactions-service';

const EMPTY: readonly ChatReaction[] = [];
const GRACE_MS = 2000;
/** A failed read is tried this many times in all, with a growing pause, then waits for the next reconnect. */
export const READ_TRIES = 3;
export const RETRY_BASE_MS = 1000;

const rows = new Map<string, readonly ChatReaction[]>();
const watchers = new Map<string, number>();
const loaded = new Set<string>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
const retryTimers = new Set<ReturnType<typeof setTimeout>>();
/** Per (message, emoji): the latest wish of the viewer, and the writes still to send in order. */
const intent = new Map<string, boolean>();
const chains = new Map<string, Promise<void>>();
/** Per (message, emoji): the row the viewer's own tap last removed. A tap back on lifts its tombstone, since add can return that same row if the removal was skipped. */
const tappedOff = new Map<string, string>();
let stop: (() => void) | null = null;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let closeTimer: ReturnType<typeof setTimeout> | undefined;
/** Changes that land while a read is in flight, so the read's older answer cannot undo them. */
let touched: { added: Map<string, ChatReaction>; deleted: Set<string> } | null = null;
let inflight = 0;
let viewer: string | null = null;
/** Bumped when the store is cleared for another viewer: an answer to an older read is dropped. */
let generation = 0;
let reading = false;
let failures = 0;
/** Messages whose reaction rows are wanted by the next read round. */
const wanted = new Set<string>();
/** Ids removed here or live: a late write response or a stale read cannot bring them back. Bounded; cleared with the store. */
const gone = new Set<string>();
const GONE_MAX = 500;
/** Bumped only when the VIEWER changes (or sign-out): a write of an older viewer never touches the new viewer's store. */
let viewerGen = 0;

const emit = () => listeners.forEach((l) => l());
const same = (a: ChatReaction, b: ChatReaction) => a.messageId === b.messageId && a.profileId === b.profileId && a.emoji === b.emoji;
const keyOf = (messageId: string, emoji: string) => `${messageId}\u0000${emoji}`;
const hidden = () => typeof document !== 'undefined' && document.hidden;

export const subscribeStore = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const reactionsOf = (messageId: string): readonly ChatReaction[] => rows.get(messageId) ?? EMPTY;

function put(messageId: string, next: readonly ChatReaction[]) {
  if (next.length === 0) rows.delete(messageId);
  else rows.set(messageId, next);
  emit();
}

function upsert(r: ChatReaction) {
  if (gone.has(r.id)) return;
  const cur = rows.get(r.messageId) ?? EMPTY;
  // The same reaction already shown (an optimistic copy, or the live echo of the write): the real id replaces it.
  const i = cur.findIndex((x) => x.id === r.id || same(x, r));
  const replaced = i >= 0 ? cur[i] : undefined;
  if (replaced && replaced.id !== r.id) touched?.added.delete(replaced.id);
  put(r.messageId, i < 0 ? [...cur, r] : cur.map((x, j) => (j === i ? r : x)));
  touched?.added.set(r.id, r);
}

function drop(id: string): boolean {
  if (!id.startsWith('tmp:')) {
    gone.add(id);
    if (gone.size > GONE_MAX) gone.delete(gone.values().next().value as string);
  }
  if (touched) {
    touched.deleted.add(id);
    touched.added.delete(id);
  }
  for (const [messageId, list] of rows) {
    if (list.some((x) => x.id === id)) {
      put(messageId, list.filter((x) => x.id !== id));
      return true;
    }
  }
  return false;
}

/** Replace what is known about `ids` with the server's answer, keeping what changed live while the read was out. Returns false when the read failed. */
async function read(ids: string[]): Promise<boolean> {
  const gen = generation;
  if (inflight++ === 0) touched = { added: new Map(), deleted: new Set() };
  try {
    const fresh = await listReactions(ids, () => !hidden());
    if (gen !== generation) return true;
    if (!fresh) {
      // Hidden part way: a partial answer must not replace what is shown. The visibility handler reads these again.
      ids.forEach((id) => wanted.add(id));
      return true;
    }
    const t = touched;
    const merged = fresh.filter((r) => !t?.deleted.has(r.id) && !gone.has(r.id));
    for (const r of t?.added.values() ?? []) {
      if (t?.deleted.has(r.id) || gone.has(r.id)) continue;
      if (ids.includes(r.messageId) && !merged.some((m) => m.id === r.id || same(m, r))) merged.push(r);
    }
    for (const id of ids) {
      if (!watchers.has(id)) continue;
      loaded.add(id);
      const mine = (rows.get(id) ?? EMPTY).filter((x) => x.id.startsWith('tmp:'));
      put(id, [...merged.filter((r) => r.messageId === id), ...mine.filter((x) => !merged.some((m) => same(m, x)))]);
    }
    return true;
  } catch {
    // A failed read must not blank what is shown; the caller tries again after a jittered, growing pause.
    return false;
  } finally {
    if (gen === generation && --inflight === 0) touched = null;
  }
}

/**
 * The ONE place a read is issued (initial load, retry, reconnect): never while the tab is hidden (the visibility handler pumps again),
 * one in flight, and whatever is wanted meanwhile joins the next round (so at most one queued).
 */
function pump() {
  if (reading || hidden()) return;
  reading = true;
  const gen = generation;
  void (async () => {
    try {
      while (gen === generation && !hidden()) {
        const ids = [...wanted].filter((id) => watchers.has(id));
        wanted.clear();
        if (ids.length === 0) break;
        const ok = await read(ids);
        if (gen !== generation) return;
        if (ok) failures = 0;
        else retryLater(ids);
      }
    } finally {
      if (gen === generation) reading = false;
    }
  })();
}

/** A failed read is tried again after a growing pause with jitter (half to all of the nominal), a bounded number of times in all. */
function retryLater(ids: string[]) {
  if (++failures >= READ_TRIES) return;
  const nominal = RETRY_BASE_MS * 2 ** (failures - 1);
  const timer = setTimeout(() => {
    retryTimers.delete(timer);
    ids.forEach((id) => watchers.has(id) && wanted.add(id));
    pump();
  }, nominal * (0.5 + Math.random() * 0.5));
  retryTimers.add(timer);
}

/** Re-read every watched message (a reconnect). */
function refetchAll() {
  failures = 0;
  for (const id of watchers.keys()) wanted.add(id);
  pump();
}

function onVisibility() {
  if (!hidden() && wanted.size > 0) pump();
}

function flush() {
  flushTimer = undefined;
  failures = 0;
  for (const id of pending) if (watchers.has(id)) wanted.add(id);
  pending.clear();
  pump();
}

function open() {
  if (stop) return;
  const unsubscribe = subscribeToReactions(upsert, (id) => void drop(id), refetchAll);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  stop = () => {
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
    unsubscribe();
  };
}

function forgetAll() {
  stop?.();
  stop = null;
  rows.clear();
  loaded.clear();
  pending.clear();
  intent.clear();
  chains.clear();
  tappedOff.clear();
  retryTimers.forEach(clearTimeout);
  retryTimers.clear();
  clearTimeout(flushTimer);
  flushTimer = undefined;
  touched = null;
  inflight = 0;
  reading = false;
  failures = 0;
  wanted.clear();
  gone.clear();
  generation++;
}

function close() {
  closeTimer = undefined;
  if (watchers.size > 0) return;
  forgetAll();
  emit();
}

/** Another viewer: nothing of the previous one is kept or shown. Watchers stay and read again as the new viewer. */
function switchViewer(next: string): boolean {
  const had = viewer !== null && viewer !== next;
  viewer = next;
  if (!had) return false;
  viewerGen++;
  forgetAll();
  emit();
  return true;
}

/** Clear everything (sign-out). */
export function clearReactionStore() {
  clearTimeout(closeTimer);
  closeTimer = undefined;
  viewer = null;
  viewerGen++;
  forgetAll();
  emit();
}

/** Start reading and following a message's reactions as `viewerId`; returns the stop function. */
export function watchReactions(messageId: string, viewerId: string): () => void {
  const switched = switchViewer(viewerId);
  clearTimeout(closeTimer);
  closeTimer = undefined;
  watchers.set(messageId, (watchers.get(messageId) ?? 0) + 1);
  open();
  if (!loaded.has(messageId)) pending.add(messageId);
  if (switched) for (const id of watchers.keys()) pending.add(id);
  if (pending.size > 0) flushTimer ??= setTimeout(flush, 0);
  return () => {
    const n = (watchers.get(messageId) ?? 1) - 1;
    if (n > 0) {
      watchers.set(messageId, n);
    } else {
      watchers.delete(messageId);
      // Gone from the screen: what is held for it goes stale (no events are followed for it), so it is read again when watched again.
      loaded.delete(messageId);
      pending.delete(messageId);
    }
    if (watchers.size === 0) closeTimer ??= setTimeout(close, GRACE_MS);
  };
}

/** Put a reaction back (a failed removal): lifts its tombstone first. */
function restore(row: ChatReaction) {
  gone.delete(row.id);
  touched?.deleted.delete(row.id);
  upsert(row);
}

/** Send one write for (message, emoji) if it still is the viewer's latest wish; a superseded write is skipped (the later one decides). */
async function send(messageId: string, emoji: string, on: boolean, tempId: string | null, own: ChatReaction | undefined, vg: number) {
  const k = keyOf(messageId, emoji);
  // Another viewer since the tap: nothing of it is sent or applied (intent for this key may now be the new viewer's).
  if (vg !== viewerGen || intent.get(k) !== on) return;
  const current = () => vg === viewerGen && intent.get(k) === on;
  if (on) {
    try {
      const row = await addReaction(messageId, emoji);
      if (vg !== viewerGen) return;
      // Null: the reaction was already removed again on the server. A later "off" decides what is shown.
      if (!row) {
        if (tempId) drop(tempId);
        return;
      }
      if (current()) upsert(row);
    } catch (e) {
      if (tempId && vg === viewerGen) drop(tempId);
      throw e;
    }
    return;
  }
  try {
    await removeReaction(messageId, emoji);
  } catch (e) {
    if (own && !own.id.startsWith('tmp:') && current()) restore(own);
    throw e;
  }
}

/** Add or remove the viewer's own reaction. Optimistic; throws after rolling back when the server refuses. */
export function setReaction(messageId: string, emoji: string, on: boolean, me: string): Promise<void> {
  const own = reactionsOf(messageId).find((r) => r.profileId === me && r.emoji === emoji);
  if (on ? own : !own) return Promise.resolve();
  const k = keyOf(messageId, emoji);
  intent.set(k, on);
  let tempId: string | null = null;
  if (on) {
    const lifted = tappedOff.get(k);
    if (lifted) {
      gone.delete(lifted);
      touched?.deleted.delete(lifted);
    }
    tempId = `tmp:${Math.random().toString(36).slice(2)}`;
    upsert({ id: tempId, messageId, profileId: me, emoji });
  } else if (own) {
    if (!own.id.startsWith('tmp:')) tappedOff.set(k, own.id);
    drop(own.id);
  }
  const vg = viewerGen;
  const task = (chains.get(k) ?? Promise.resolve()).then(() => send(messageId, emoji, on, tempId, own, vg));
  const settled = task.catch(() => {
    // A failed write can leave the screen and the server apart (an add that landed behind a removal that failed): ask the server.
    if (vg !== viewerGen) return;
    wanted.add(messageId);
    pump();
  });
  chains.set(k, settled);
  void settled.then(() => {
    if (chains.get(k) === settled) {
      chains.delete(k);
      intent.delete(k);
      tappedOff.delete(k);
    }
  });
  return task;
}
