/**
 * @file use-close-draft.ts
 * @description P1542 review rounds 4–9: the close's two written answers — "how can we improve" and "what did you like"
 * — as typed, kept in this tab's storage until they are saved. Inside the event room the close is drawn only while its
 * view is shown, so a room tab switch unmounts it; this keeps a half-typed answer across that, without a hidden second
 * copy of the close.
 *
 * WORDS ONLY. The quote permission is never kept here (round 9): it lives on the server and is written only by the box
 * itself (use-quote-consent.ts). A draft that older code left with a permission in it is read without that field.
 *
 *  - Owned by one person (D1): the key carries the viewer's id, and any other person's draft in this tab is removed
 *    when the close opens — someone signing in next never sees the previous attendee's words.
 *  - A revision wins until it is submitted (D3): only fields the person changed are stored, and a stored field is
 *    preferred over the saved server answer.
 *  - Cleared once saved (D4): `markSaved(sent)` after each successful save — only what still equals what was sent (Q2)
 *    — and `clear()` when the close is finished.
 *  - Read field by field (Q4): anything not a string is absent.
 * Storage is best effort: blocked storage means no draft, never an error.
 */
import { useCallback, useState } from 'react';

const PREFIX = 'p1542-close-draft:';
const keyFor = (viewerId: string, eventId: string) => `${PREFIX}${viewerId}:${eventId}`;

type Draft = { liked?: string; improve?: string };

function readDraft(key: string): Draft {
  try {
    const raw = JSON.parse(sessionStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    const d: Draft = {};
    if (typeof raw.liked === 'string') d.liked = raw.liked;
    if (typeof raw.improve === 'string') d.improve = raw.improve;
    return d;
  } catch {
    return {};
  }
}

function storeDraft(key: string, d: Draft) {
  try {
    if (Object.keys(d).length === 0) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(d));
  } catch { /* storage blocked: no draft */ }
}
const patchDraft = (key: string, patch: Draft) => storeDraft(key, { ...readDraft(key), ...patch });

/** D1/Q3: what this tab holds under `prefix` for anyone other than `viewerId` is removed (a key with no viewer — the
 *  older `prefix<event>` form — counts as someone else's). */
export function dropOthers(prefix: string, viewerId: string) {
  try {
    const mine = `${prefix}${viewerId}:`;
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(prefix) && !k.startsWith(mine)) sessionStorage.removeItem(k);
    }
  } catch { /* storage blocked */ }
}

/** Q3: the close's resume point, per person and event; another person's in this tab is dropped first. */
export function closeStepKey(viewerId: string, eventId: string): string {
  dropOthers('p1389-step:', viewerId);
  return `p1389-step:${viewerId}:${eventId}`;
}

type Saved = { liked: string | null; improve: string | null };
type Sent = { liked: string; improve: string };

export function useCloseDraft(viewerId: string, eventId: string, saved: Saved) {
  const key = keyFor(viewerId, eventId);
  const [initial] = useState(() => {
    dropOthers(PREFIX, viewerId);
    const d = readDraft(key);
    storeDraft(key, d); // rewrite without any field older code kept (a permission included)
    return { liked: d.liked ?? saved.liked ?? '', improve: d.improve ?? saved.improve ?? '' };
  });
  const [liked, setLikedState] = useState(initial.liked);
  const [improve, setImproveState] = useState(initial.improve);
  const setLiked = useCallback((v: string) => { setLikedState(v); patchDraft(key, { liked: v }); }, [key]);
  const setImprove = useCallback((v: string) => { setImproveState(v); patchDraft(key, { improve: v }); }, [key]);
  /** After a save that sent `sent` succeeded: only drafts still equal to what was sent go (D4, Q2). */
  const markSaved = useCallback((sent: Sent) => {
    const d = readDraft(key);
    if (d.liked === sent.liked) delete d.liked;
    if (d.improve === sent.improve) delete d.improve;
    storeDraft(key, d);
  }, [key]);
  const clear = useCallback(() => storeDraft(key, {}), [key]);
  return { liked, setLiked, improve, setImprove, markSaved, clear };
}
