/**
 * @file composer-tag-bus.ts
 * @description P1536 D5 / J2 / J3 / J4: how an "Add to chat" tap on the canvas reaches the composer of the thread beside it. The canvas page cannot reach into the
 * composer, and on a published canvas the composer does not exist yet (the tap enters a pending Clone, and the panel mounts after it), so a tag is HELD until
 * a composer is there AND the workspace says it has landed on the right thread: the pending Clone's, or the open draft's. A tag whose target never came (the J4 sheet
 * was dismissed, a read hung) is dropped: on dismissal at once, otherwise after `HELD_MAX_MS` (not while the owner is still being asked), and a drop after the wait is announced, never silent.
 * One bus per workspace (canvas-with-thread provides it); a composer outside it has no tagging.
 */
import { createContext } from 'react';

/** How long a tag waits for its thread before it is dropped (the longest honest wait is the J4 sheet's two reads, a second or so). */
export const HELD_MAX_MS = 15_000;

/** Puts one tag in the composer; `sync` when it is called from the tap handler itself (the caret and focus must be set inside it). */
export type TagInserter = (tag: string, sync: boolean) => void;

export interface ComposerTagBus {
  /** Holds a tag for the composer (dropped, with a sentence from `onExpire`, if it is still held after `HELD_MAX_MS`). */
  hold: (tag: string) => void;
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
}

export function createComposerTagBus(): ComposerTagBus {
  let held: Array<{ tag: string; timer: ReturnType<typeof setTimeout> }> = [];
  let inserter: TagInserter | null = null;
  let landed: () => boolean = () => true;
  let onLate: () => void = () => undefined;
  let onExpire: () => boolean = () => false;
  const flush = (sync: boolean) => {
    if (!inserter || held.length === 0 || !landed()) return;
    const take = held;
    held = [];
    for (const h of take) {
      clearTimeout(h.timer);
      inserter(h.tag, sync);
    }
    if (!sync) onLate(); // landed without a tap to show it: the thread is brought into view now
  };
  return {
    hold: tag => {
      const entry = { tag, timer: undefined as unknown as ReturnType<typeof setTimeout> };
      const arm = () => {
        entry.timer = setTimeout(() => {
          if (onExpire()) arm();
          else held = held.filter(h => h !== entry);
        }, HELD_MAX_MS);
      };
      arm();
      held.push(entry);
    },
    size: () => held.length,
    flush,
    clear: () => { held.forEach(h => clearTimeout(h.timer)); held = []; },
    register: insert => {
      inserter = insert;
      flush(false);
      return () => { if (inserter === insert) inserter = null; };
    },
    configure: (l, late, expire) => { landed = l; onLate = late; onExpire = expire; },
  };
}

export const ComposerTagContext = createContext<ComposerTagBus | null>(null);
