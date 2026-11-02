/**
 * @file composer-tag-bus.ts
 * @description P1536 D5 / J2 / J3: how an "Add to chat" tap on the canvas reaches the composer of the thread beside it. The canvas page cannot reach into the
 * composer, and on a published canvas the composer does not exist yet (the tap enters a pending Clone, and the panel mounts after it), so a tag is HELD until
 * a composer is there AND the workspace says it has landed on the right thread: the pending Clone's, or the open draft's. A tag whose target never came
 * (the J4 sheet was dismissed, a check failed) is dropped: on dismissal at once, otherwise when it is older than `HELD_MAX_MS`.
 * One bus per workspace (canvas-with-thread provides it); a composer outside it has no tagging.
 */
import { createContext } from 'react';

/** How long a tag waits for its thread before it is dropped (the longest wait is the J4 sheet's two reads, a second or so). */
export const HELD_MAX_MS = 15_000;

/** Puts one tag in the composer; `sync` when it is called from the tap handler itself (the caret and focus must be set inside it). */
export type TagInserter = (tag: string, sync: boolean) => void;

export interface ComposerTagBus {
  /** Holds a tag for the composer. */
  hold: (tag: string) => void;
  /** Inserts every held tag the composer can take now. */
  flush: (sync: boolean) => void;
  /** Drops what is held. */
  clear: () => void;
  /** A composer announces itself (and is asked to take what waits); returns what to call when it unmounts. */
  register: (insert: TagInserter) => () => void;
  /** The workspace's rule for "the thread the tags were meant for is on screen", and what to do when a tag lands late (show the thread). */
  configure: (landed: () => boolean, onLateLanding: () => void) => void;
}

export function createComposerTagBus(now: () => number = Date.now): ComposerTagBus {
  let held: Array<{ tag: string; at: number }> = [];
  let inserter: TagInserter | null = null;
  let landed: () => boolean = () => true;
  let onLate: () => void = () => undefined;
  const flush = (sync: boolean) => {
    held = held.filter(h => now() - h.at <= HELD_MAX_MS);
    if (!inserter || held.length === 0 || !landed()) return;
    const take = held;
    held = [];
    for (const h of take) inserter(h.tag, sync);
    if (!sync) onLate(); // landed without a tap to show it: the thread is brought into view now
  };
  return {
    hold: tag => { held.push({ tag, at: now() }); },
    flush,
    clear: () => { held = []; },
    register: insert => {
      inserter = insert;
      flush(false);
      return () => { if (inserter === insert) inserter = null; };
    },
    configure: (l, late) => { landed = l; onLate = late; },
  };
}

export const ComposerTagContext = createContext<ComposerTagBus | null>(null);
