/**
 * P1512: small hooks shared by the chat components.
 */
import type { ChatMessage } from '@/app/data/chat-service';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { backPlan, chatNav, HOME, leavePlan, routeLevel, type NavIntent, type NavPlan } from './chat-view-model';

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
}

/** P1520: give a draft back to ITS slot without showing it anywhere (the composer has moved to another slot). */
export function stashDraft(key: string, value: string): void {
  if (value) drafts.set(key, value);
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

/** Live result of a media query (false where matchMedia does not exist). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches === true);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches === true);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, [query]);
  return matches;
}

/** Tailwind's lg: the two-pane desktop layout. */
export const DESKTOP_QUERY = '(min-width: 1024px)';

/** A wide screen with a real hover: the only place the message toolbar floats over the text. */
export const DESKTOP_HOVER_QUERY = '(min-width: 1024px) and (hover: hover)';

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
