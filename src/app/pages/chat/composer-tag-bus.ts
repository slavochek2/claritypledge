/**
 * @file composer-tag-bus.ts
 * @description P1536 D5 / J2 / J3 / J4, P1621: how a "Mention in chat" tap on the canvas reaches the composer of the thread beside it. The canvas page cannot reach into the
 * composer, and on a published canvas the composer does not exist yet (the tap enters a pending Clone, and the panel mounts after it), so a tag is HELD until
 * a composer is there AND the workspace says it has landed on the right thread: the pending Clone's, or the open draft's. A tag whose target never came (the J4 sheet
 * was dismissed, a read hung) is dropped: on dismissal at once, otherwise after `HELD_MAX_MS` (not while the owner is still being asked), and a drop after the wait is announced, never silent.
 * The bus also answers "which boxes are mentioned": the tags held plus the tags in the composer's value (the composer reports them), so a box can say "Mentioned" while its pill is there.
 * One bus per workspace (canvas-with-thread provides it); a composer outside it has no tagging.
 */
import { createContext } from 'react';

/** How long a tag waits for its thread before it is dropped (the longest honest wait is the J4 sheet's two reads, a second or so). */
export const HELD_MAX_MS = 15_000;

/** Puts one tag in the composer; `sync` when it is called from the tap handler itself (focus must be set inside it); `focus` false: the tag lands and focus stays where it is. */
export type TagInserter = (tag: string, sync: boolean, focus: boolean) => void;

export interface ComposerTagBus {
  /** Holds a tag for the composer (dropped, with a sentence from `onExpire`, if it is still held after `HELD_MAX_MS`). `focus` (default true) false: the tag lands without moving focus. */
  hold: (tag: string, opts?: { focus?: boolean }) => void;
  /** How many tags are held. */
  size: () => number;
  /** Inserts every held tag the composer can take now, each on the value the one before left. */
  flush: (sync: boolean) => void;
  /** Drops what is held (silently: the owner just answered the question it waited on). */
  clear: () => void;
  /** A composer announces itself (and is asked to take what waits); returns what to call when it unmounts. */
  register: (insert: TagInserter) => () => void;
  /**
   * The workspace's rule for "the thread the tags were meant for is on screen", what to do when a tag lands late (show the thread), and what to do when a held tag
   * reaches its time (say so and return false to drop it; return true to keep waiting, for another `HELD_MAX_MS`: the owner is still being asked).
   */
  configure: (landed: () => boolean, onLateLanding: () => void, onExpire: () => boolean) => void;
  /** The boxes mentioned now: the tags held plus the tags in the composer's value. A new set whenever it changes (a snapshot for useSyncExternalStore). */
  mentioned: () => ReadonlySet<string>;
  /** Calls `listener` whenever `mentioned()` changes; returns what to call to stop. */
  subscribe: (listener: () => void) => () => void;
  /** The composer says which tags its value holds now (empty when it left). */
  report: (tags: readonly string[]) => void;
}

export function createComposerTagBus(): ComposerTagBus {
  let held: Array<{ tag: string; focus: boolean; timer: ReturnType<typeof setTimeout> }> = [];
  let inserter: TagInserter | null = null;
  let landed: () => boolean = () => true;
  let onLate: () => void = () => undefined;
  let onExpire: () => boolean = () => false;
  let reported: readonly string[] = [];
  let flushing = false;
  let reportedSince = false; // whether the composer reported since the last flush began
  let handed: string[] = []; // taken from the held ones, counted until the composer reports what its value holds (no flicker between the two)
  let snapshot: ReadonlySet<string> = new Set();
  const listeners = new Set<() => void>();
  const change = () => {
    const next = new Set([...held.map(h => h.tag), ...handed, ...reported]);
    if (next.size === snapshot.size && [...next].every(t => snapshot.has(t))) return;
    snapshot = next;
    listeners.forEach(l => l());
  };
  const flush = (sync: boolean) => {
    if (!inserter || held.length === 0 || !landed()) return;
    const take = held;
    held = [];
    handed = take.map(h => h.tag);
    reportedSince = false;
    flushing = true;
    try {
      for (const h of take) {
        clearTimeout(h.timer);
        inserter(h.tag, sync, h.focus);
      }
    } finally {
      flushing = false;
    }
    // The handed tags count until the composer has reported what its value holds. It does so as it takes each tag; a composer that has not yet (it reports from an effect) leaves them
    // counted, so a mention never reads as dropped for a frame. The next report, or clear, ends it.
    if (reportedSince) handed = [];
    change();
    if (!sync) onLate(); // landed without a tap to show it: the thread is brought into view now
  };
  return {
    hold: (tag, opts) => {
      const entry = { tag, focus: opts?.focus ?? true, timer: undefined as unknown as ReturnType<typeof setTimeout> };
      const arm = () => {
        entry.timer = setTimeout(() => {
          if (onExpire()) arm();
          else {
            // one sentence for the batch: tags tapped together wait for the same thread, so they are dropped together
            held.forEach(h => clearTimeout(h.timer));
            held = [];
            change();
          }
        }, HELD_MAX_MS);
      };
      arm();
      held.push(entry);
      change();
    },
    size: () => held.length,
    flush,
    clear: () => { held.forEach(h => clearTimeout(h.timer)); held = []; handed = []; change(); },
    register: insert => {
      inserter = insert;
      flush(false);
      return () => { if (inserter === insert) inserter = null; };
    },
    configure: (l, late, expire) => { landed = l; onLate = late; onExpire = expire; },
    mentioned: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    report: tags => { reported = tags; reportedSince = true; if (!flushing) handed = []; change(); },
  };
}

export const ComposerTagContext = createContext<ComposerTagBus | null>(null);
