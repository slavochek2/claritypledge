/**
 * P1512: small hooks shared by the chat components.
 */
import type { ChatMessage } from '@/app/data/chat-service';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { backPlan, chatNav, HOME, leavePlan, routeLevel, type NavIntent, type NavPlan } from './chat-view-model';
import { mergeDictation } from './dictation-text';
import { clearPendingExcept } from './pending-dictation';

/**
 * While `on`, a press outside every given ref and the Escape key both call `onClose`.
 * Escape is marked handled (preventDefault) so a panel behind a menu does not also close.
 */
export function useDismiss(onClose: () => void, on: boolean, refs: RefObject<HTMLElement | null>[]) {
  const close = useRef(onClose);
  close.current = onClose;
  const keep = useRef(refs);
  keep.current = refs;
  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      close.current();
    };
    const onPress = (e: MouseEvent) => {
      const target = e.target as Node;
      if (keep.current.every((r) => !r.current || !r.current.contains(target))) close.current();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPress);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPress);
    };
  }, [on]);
}

/** True while the tab is in front. Read the live value; nothing else re-renders on a flip. */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, []);
  return visible;
}

/**
 * The unsent text of each conversation, kept while the person looks at another chat. Keys start
 * with the signed-in user's id, and everyone else's drafts are dropped when the user changes, so
 * one person's half-written message can never show up in the next person's composer.
 */
const drafts = new Map<string, string>();

/** Drops every draft that does not belong to `userId` (all of them when signed out). */
export function clearDraftsExcept(userId: string | null): void {
  for (const key of [...drafts.keys()]) {
    if (!userId || !key.startsWith(`${userId}:`)) drafts.delete(key);
  }
  clearPendingExcept(userId); // dictated words waiting for room belong to the same person
}

/** P1520: give a draft back to ITS slot without showing it anywhere (the composer has moved to another slot). */
export function stashDraft(key: string, value: string): void {
  // Never over a newer draft written in that slot meanwhile.
  if (value && !drafts.get(key)) drafts.set(key, value);
}

/** The draft stored under `key` ('' when none). Reads the store, not what a composer shows. */
export function peekDraft(key: string): string {
  return drafts.get(key) ?? '';
}

/**
 * P1576: put dictated text into the draft of the slot it was spoken in, at the caret it was started
 * from, without showing it anywhere. For a transcript that resolves after the composer moved to
 * another chat (or unmounted): unlike `stashDraft` it merges into a draft that already has text.
 * Returns false, leaving the draft as it was, when the words would take it past the message cap: the
 * caller then holds them for that chat (`pending-dictation`), so they are neither cut nor lost.
 */
export function insertIntoDraft(key: string, text: string, caret: number): boolean {
  const merged = mergeDictation(drafts.get(key) ?? '', text, caret);
  if (!merged.fits) return false;
  if (merged.value) drafts.set(key, merged.value);
  return true;
}

/** Changes the stored draft of a slot without showing it anywhere (for a slot the composer has left). */
export function editStoredDraft(key: string, edit: (value: string) => string): void {
  const next = edit(drafts.get(key) ?? '');
  if (next) drafts.set(key, next);
  else drafts.delete(key);
}

export function useDraft(key: string): [string, (value: string) => void] {
  const [value, setValue] = useState(() => drafts.get(key) ?? '');
  useEffect(() => {
    setValue(drafts.get(key) ?? '');
  }, [key]);
  const set = useCallback(
    (next: string) => {
      if (next) drafts.set(key, next);
      else drafts.delete(key);
      setValue(next);
    },
    [key],
  );
  return [value, set];
}

/** A desktop-pointer check for "Enter sends": touch keyboards use Enter for a new line. */
export function hasFinePointer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  return window.matchMedia('(pointer: fine)').matches;
}

export { useMediaQuery, DESKTOP_QUERY } from '@/app/hooks/use-media-query';

/**
 * The behaviour of a menu opened at a point (PopMenu, the reaction picker): Escape and an outside press close it, the first item takes
 * focus, arrows / Home / End move between items, and focus goes back to whatever opened it (or to `fallback` when that is gone,
 * e.g. an inline toolbar that unmounted). Returns the menu's `onKeyDown`.
 */
export function useMenuBehavior(ref: RefObject<HTMLElement | null>, onClose: () => void, fallback?: () => HTMLElement | null) {
  const opener = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null));
  const fallbackRef = useLatest(fallback);
  useDismiss(onClose, true, [ref]);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const back = opener.current;
    return () => {
      if (back && back !== document.body && back.isConnected) back.focus({ preventScroll: true });
      // eslint-disable-next-line react-hooks/exhaustive-deps -- a latest-value holder, not a DOM ref: the newest callback is wanted at cleanup
      else fallbackRef.current?.()?.focus({ preventScroll: true });
    };
  }, [ref, fallbackRef]);
  return (e: { key: string; preventDefault: () => void }) => {
    const nodes = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    const next = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? nodes.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    nodes[(next + nodes.length) % nodes.length]?.focus();
  };
}

/** A ref that always holds the latest `value` (assigned during render), for handlers and effects that must not re-subscribe on every change. */
export function useLatest<T>(value: T): { current: T } {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

/** A wide screen with a real hover: the only place the message toolbar floats over the text. */
export const DESKTOP_HOVER_QUERY = '(min-width: 1024px) and (hover: hover)';
/**
 * P1652: below 400px the toolbar (five 40px buttons plus Clarify with its word, about 307px) does not fit the row, whose chrome takes
 * 78px (margin 16, padding 16, avatar 36, gap 10): it needs 385px of viewport. Forward then moves into the ⋯ menu.
 */
export const NARROW_QUERY = '(max-width: 399px)';

/**
 * Runs a navigation at most once per history entry: a double tap lands twice before the screen has
 * changed, and two pops would leave the app. Re-armed whenever the location changes.
 */
function useOncePerLocation(): (go: () => void) => void {
  const { key } = useLocation();
  const fired = useRef(false);
  useEffect(() => {
    fired.current = false;
  }, [key]);
  return useCallback((go: () => void) => {
    if (fired.current) return;
    fired.current = true;
    go();
  }, []);
}

/** Move inside Home by the history rule (chatNav): push, or swap the entry in place, or nothing when already there. Says which. */
export function useChatNavigate(): (to: string, intent?: NavIntent) => NavPlan['mode'] {
  const navigate = useNavigate();
  const location = useLocation();
  const here = useRef(location);
  here.current = location;
  return useCallback(
    (to, intent = 'open') => {
      const plan = chatNav({ pathname: here.current.pathname, state: here.current.state }, to, intent);
      if (plan.mode !== 'none') navigate(to, { replace: plan.mode === 'replace', state: plan.state });
      return plan.mode;
    },
    [navigate],
  );
}

/**
 * Back / close inside the chat: pops to the nearest real way back (the list for a chat, the chat for a thread, the chat
 * a Clarify came from); with none in the history it replaces with the parent, so a cold arrival or a link never loops.
 */
export function useBack(): () => void {
  const navigate = useNavigate();
  const { pathname, state } = useLocation();
  const once = useOncePerLocation();
  return useCallback(() => {
    once(() => {
      const step = backPlan(pathname, state);
      if (step.kind === 'pop') navigate(-step.steps);
      else navigate(step.to, { replace: true, state: step.state });
    });
  }, [once, navigate, pathname, state]);
}

// A leave that has to step back first and replace what it lands on (a chat reached from outside, then a thread over it).
// react-router moves asynchronously, so the second half waits for the location to change: ChatHomePage finishes it.
let replaceHomeAfterPop = false;
let replaceHomeTimer: ReturnType<typeof setTimeout> | undefined;
function armReplaceHome() {
  replaceHomeAfterPop = true;
  clearTimeout(replaceHomeTimer);
  replaceHomeTimer = setTimeout(() => {
    replaceHomeAfterPop = false;
  }, 2000);
}

// From the moment a leave starts until it has landed on the list, nothing may read the chat being left: its pane is
// still mounted for a render or two (a pop is not instant), and a read then would undo "mark as unread".
let leaving = false;
let leavingTimer: ReturnType<typeof setTimeout> | undefined;
function beginLeave() {
  leaving = true;
  clearTimeout(leavingTimer);
  leavingTimer = setTimeout(() => {
    leaving = false;
  }, 3000);
}
/** True while a leave is under way: the read effects of the chat being left stand down. */
export const isLeavingChat = () => leaving;

/** Mounted once in Home: after a stepped-back leave lands, replaces what it landed on with the list; ends the leave on the list. */
export function useFinishLeave() {
  const navigate = useNavigate();
  const { key, pathname } = useLocation();
  useEffect(() => {
    if (replaceHomeAfterPop) {
      replaceHomeAfterPop = false;
      clearTimeout(replaceHomeTimer);
      navigate(HOME, { replace: true });
      return;
    }
    if (leaving && routeLevel(pathname) === 'list') {
      leaving = false;
      clearTimeout(leavingTimer);
    }
  }, [key, pathname, navigate]);
}

/**
 * Leaving the open chat for good (archive, mark as unread): to the list, stepping back over what belongs to the chat,
 * and never leaving a chat entry behind in the history.
 */
export function useLeaveChat(): () => void {
  const navigate = useNavigate();
  const { pathname, state } = useLocation();
  const once = useOncePerLocation();
  return useCallback(() => {
    once(() => {
      const step = leavePlan(pathname, state);
      beginLeave();
      if (step.kind === 'replace') navigate(step.to, { replace: true });
      else {
        if (step.kind === 'pop-replace') armReplaceHome();
        navigate(-step.steps);
      }
    });
  }, [once, navigate, pathname, state]);
}

// One-shot: "put the cursor in this conversation's composer". Kept out of the history on purpose, so going back and
// forward never refocuses (and never opens a phone's keyboard). Expires, so one never fired cannot surprise a later visit.
let composerFocusFor: { id: string; at: number } | null = null;
const COMPOSER_FOCUS_TTL_MS = 5000;
export function requestComposerFocus(conversationId: string) {
  composerFocusFor = { id: conversationId, at: Date.now() };
}
/** True once, for the conversation that was asked for. */
export function takeComposerFocus(conversationId: string): boolean {
  const want = composerFocusFor;
  if (!want || want.id !== conversationId) return false;
  composerFocusFor = null;
  return Date.now() - want.at < COMPOSER_FOCUS_TTL_MS;
}
/** The composer of the conversation that is open right now, if any. */
export function focusOpenComposer() {
  document.querySelector<HTMLTextAreaElement>('[data-testid="composer"] textarea')?.focus();
}

// A Clarify that has been pressed but not sent: the message waits above the mirror's composer for a note. Module-level
// like the composer-focus request, so it survives the navigation to the mirror; it expires so a forgotten one cannot
// resurface much later, and it is consumed when the mirror reads it.
export interface StagedClarify {
  message: ChatMessage;
  authorName: string;
}
const CLARIFY_TTL_MS = 10 * 60_000;
let stagedClarify: { for: string; at: number; value: StagedClarify } | null = null;
const stagedListeners = new Set<() => void>();
/** For a mirror pane that is already open when a Clarify is staged for it (no navigation, so no new mount). */
export function onClarifyStaged(listener: () => void): () => void {
  stagedListeners.add(listener);
  return () => void stagedListeners.delete(listener);
}
export function stageClarify(mirrorConversationId: string, value: StagedClarify) {
  stagedClarify = { for: mirrorConversationId, at: Date.now(), value };
  stagedListeners.forEach((l) => l());
}
/** Read once: a staged clarify that was not sent (or cancelled) must not come back on a later visit. */
export function takeStagedClarify(mirrorConversationId: string): StagedClarify | null {
  if (!stagedClarify || stagedClarify.for !== mirrorConversationId) return null;
  const { at, value } = stagedClarify;
  stagedClarify = null;
  return Date.now() - at > CLARIFY_TTL_MS ? null : value;
}
