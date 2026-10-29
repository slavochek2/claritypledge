/**
 * @file use-group-chat-opened.ts
 * @description P1542 round 6 (decision 43): "C" — has this person opened this event's group chat? Clicked is the
 * signal, not joined (WhatsApp gives no join callback).
 *
 * Local first, the server as the record:
 *   - LOCAL: the tap writes a flag in this browser at once, so the screen that was tapped updates before any network
 *     round trip, and so the rule works before the migration is applied. The flag is keyed by viewer + a hash of the
 *     normalised link (never the link itself), so one group shared by several hikes counts once here too.
 *   - SERVER: the tap also calls `mark_group_chat_opened(event_id)` and the read asks `group_chat_opened(event_id)`
 *     (another device, a cleared browser). A failed or missing RPC falls back to the local flag alone, never to
 *     "unknown means not opened" being written anywhere.
 *   - PENDING (round 6b, Codex): a tap whose server write failed (offline, migration not applied yet) leaves a separate
 *     "pending" marker; every later mount retries the write and clears the marker once it lands. A local positive
 *     still shows "opened" at once — it just no longer means the server was told.
 *   - Mixpanel `group_chat_opened {event_id, surface}` (prod only) for funnels; never read back by the UI.
 */
import { useCallback, useEffect, useState } from 'react';
import { analytics } from '@/lib/mixpanel';
import { markGroupChatOpenedOnServer, readGroupChatOpenedOnServer } from '@/app/data/group-chat-opens-service';
import { normaliseChatLink } from './group-chat-utils';
import { whenVisible } from './when-visible';

const EVENT_NAME = 'p1542:group-chat-opened';

// The normalisation itself lives beside the host list (group-chat-utils.ts), import-free, so the server-parity
// integration test can run the very same function.
export { normaliseChatLink };

/** FNV-1a, 32-bit, hex. A browser-local key only (not a security boundary): it keeps the link out of storage. */
function hashLink(url: string): string {
  let h = 0x811c9dc5;
  const s = normaliseChatLink(url);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function groupChatOpenedKey(viewerId: string, url: string): string {
  return `p1542-group-chat-opened:${viewerId}:${hashLink(url)}`;
}

export function readLocalGroupChatOpened(viewerId: string, url: string): boolean {
  try {
    return localStorage.getItem(groupChatOpenedKey(viewerId, url)) === '1';
  } catch {
    return false;
  }
}

function writeLocal(viewerId: string, url: string) {
  try {
    localStorage.setItem(groupChatOpenedKey(viewerId, url), '1');
  } catch { /* storage blocked: the server record (once the migration is applied) still answers */ }
}

/**
 * Round 10b: "this person opened this event's group chat", keyed by the EVENT (the link's own flag above is keyed by the
 * link, which a page only knows after a read). Lets a page decide, before that read lands, whether to keep a place for
 * the chat offer at all — so an offer that will not show never holds a space that then collapses. A hint only: the
 * link-keyed flag and the server stay the truth.
 */
export function eventChatOpenedHintKey(viewerId: string, eventId: string): string {
  return `p1542-group-chat-opened-event:${viewerId}:${eventId}`;
}
export function readEventChatOpenedHint(viewerId: string, eventId: string): boolean {
  try { return localStorage.getItem(eventChatOpenedHintKey(viewerId, eventId)) === '1'; } catch { return false; }
}
function writeEventChatOpenedHint(viewerId: string, eventId: string) {
  try { localStorage.setItem(eventChatOpenedHintKey(viewerId, eventId), '1'); } catch { /* private mode: no hint */ }
}

/** The tap's server write has not landed yet: per viewer + link, holding the event id to send it with. */
export function pendingWriteKey(viewerId: string, url: string): string {
  return `${groupChatOpenedKey(viewerId, url)}:pending`;
}
function setPending(viewerId: string, url: string, eventId: string | null) {
  try {
    if (eventId) localStorage.setItem(pendingWriteKey(viewerId, url), eventId);
    else localStorage.removeItem(pendingWriteKey(viewerId, url));
  } catch { /* storage blocked: nothing to retry from */ }
}
export function readPendingWrite(viewerId: string, url: string): string | null {
  try {
    return localStorage.getItem(pendingWriteKey(viewerId, url));
  } catch {
    return null;
  }
}

/** Send the tap to the server; keep the pending marker until it lands — or until the server refuses it outright
 *  (round 6c: 42501, e.g. the registration was cancelled), which no retry can change. */
async function syncOpened(viewerId: string, url: string, eventId: string) {
  setPending(viewerId, url, eventId);
  const { ok, refused } = await markGroupChatOpenedOnServer(eventId);
  if (ok || refused) setPending(viewerId, url, null);
}

export type GroupChatSurface = 'event_page' | 'registration_thankyou' | 'feedback_thankyou';

/**
 * `opened`: true / false, or undefined while the server read is out (callers render no chat offer until it is known,
 * so a returning person never sees "Join" flash before "Open"). With no link or no viewer it is false.
 */
export function useGroupChatOpened(
  eventId: string | null | undefined,
  url: string | null | undefined,
  viewerId: string | null | undefined,
): { opened: boolean | undefined; markOpened: (surface: GroupChatSurface) => void } {
  const known = !!(eventId && url && viewerId);
  // Round 10b: opened as far as this browser knows — this link, OR this event's chat under any link. The link can be
  // replaced (a rotated invite); a person who opened the event's group chat is not invited to it again, and a page that
  // kept no place for the offer (the event hint, decided before the link read) never grows one either.
  const openedHere = () => readLocalGroupChatOpened(viewerId!, url!) || readEventChatOpenedHint(viewerId!, eventId!);
  const [opened, setOpened] = useState<boolean | undefined>(() =>
    known ? (openedHere() ? true : undefined) : false,
  );

  // Round 10: which (viewer, url) the state above answers for. The url arrives after the first render (a read), and the
  // state's "false" from before it was known must not show the link for one frame and then take it away again.
  const currentKey = known ? groupChatOpenedKey(viewerId!, url!) : null;
  const [answeredFor, setAnsweredFor] = useState<string | null>(currentKey);
  useEffect(() => {
    setAnsweredFor(currentKey);
    if (!known) { setOpened(false); return; }
    // Round 7e (metered-services rule 3): the local flag is read at once (local, free); the two REQUESTS — retrying a
    // pending tap and reading the server — wait until the tab is visible. A hidden tab makes none.
    if (openedHere()) {
      writeEventChatOpenedHint(viewerId!, eventId!);
      setOpened(true);
      // A tap the server never heard about (offline, or before the migration): try again once visible.
      const pending = readPendingWrite(viewerId!, url!);
      return pending ? whenVisible(() => { void syncOpened(viewerId!, url!, pending); }) : undefined;
    }
    setOpened(undefined);
    let cancelled = false;
    const cancelWait = whenVisible(() => {
      void readGroupChatOpenedOnServer(eventId!).then(({ ok, opened: onServer }) => {
        if (cancelled) return;
        if (ok && onServer) { writeLocal(viewerId!, url!); writeEventChatOpenedHint(viewerId!, eventId!); }
        // A failed read (e.g. the migration is not applied) is "not opened as far as this browser knows".
        setOpened(openedHere() || (ok && onServer));
      });
    });
    return () => { cancelled = true; cancelWait(); };
  }, [known, eventId, url, viewerId, currentKey]);

  // Another surface on this page (or another tab) recorded the tap: follow it.
  useEffect(() => {
    if (!known) return;
    const key = groupChatOpenedKey(viewerId!, url!);
    const onLocal = (e: Event) => { if ((e as CustomEvent<string>).detail === key) setOpened(true); };
    const onStorage = (e: StorageEvent) => { if (e.key === key && e.newValue === '1') setOpened(true); };
    window.addEventListener(EVENT_NAME, onLocal);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT_NAME, onLocal);
      window.removeEventListener('storage', onStorage);
    };
  }, [known, viewerId, url]);

  const markOpened = useCallback((surface: GroupChatSurface) => {
    if (!known) return;
    writeLocal(viewerId!, url!);
    writeEventChatOpenedHint(viewerId!, eventId!);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: groupChatOpenedKey(viewerId!, url!) }));
    analytics.track('group_chat_opened', { event_id: eventId, surface });
    void syncOpened(viewerId!, url!, eventId!);
  }, [known, eventId, url, viewerId]);

  const current = answeredFor === currentKey
    ? opened
    : (known ? (openedHere() ? true : undefined) : false);
  return { opened: current, markOpened };
}

/** "Join WhatsApp group" → "Open WhatsApp group" (the label once the person has opened it). */
export function openedChatLabel(joinLabel: string): string {
  return joinLabel.replace(/^Join /, 'Open ');
}
