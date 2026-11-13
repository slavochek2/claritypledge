/**
 * @file use-chat-home.ts
 * @description The Home page's state and effects: the session recorder stays off, and which right-hand panel is open.
 */
import { useCallback, useContext, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { analytics } from '@/lib/mixpanel';
import { useBack, useFinishLeave } from './chat-hooks';
import { SAFETY_POLL_MS } from './chat-provider';
import { chatPath } from './chat-view-model';
import { useClarifyPanel } from './use-clarify-panel';
import { pointsPanelShown, useClosePointsPanel } from './points-panel';
import { ChatContext } from './chat-state';
import type { parseChatRoute } from './chat-view-model';

/** Once stopped, Mixpanel stays stopped for the rest of the page's life; later visits render at once. */
let sessionRecordingStopped = false;

type ChatSummary = NonNullable<React.ContextType<typeof ChatContext>>['chats'][number];

/** Chats show people's messages: never record them (privacy policy). True once the recorder is stopped; no chat content mounts before. */
export function useRecordingOff() {
  const [recordingOff, setRecordingOff] = useState(sessionRecordingStopped);
  useEffect(() => {
    analytics.stopSessionRecording();
    sessionRecordingStopped = true;
    setRecordingOff(true);
  }, []);
  return recordingOff;
}

/** The right-hand panel: the Mirror's Clarify thread beside this chat (P1631) wins over the chat's own open thread; null when neither. */
function sidePanelOf(chats: ChatSummary[], summary: ChatSummary | undefined, rootId: string | null | undefined, clarifyRoot: string | null): { summary: ChatSummary; rootId: string; clarify: boolean } | null {
  if (!summary) return null;
  const mirror = clarifyRoot ? chats.find((c) => c.kind === 'mirror') : undefined;
  if (clarifyRoot && mirror) return { summary: mirror, rootId: clarifyRoot, clarify: true };
  return rootId ? { summary, rootId, clarify: false } : null;
}

/** Which panel is open beside the chat, and Escape closing it the way its Back does (a dialog or menu that handled Escape marked it as taken). */
export function useSidePanels(chats: ChatSummary[], summary: ChatSummary | undefined, route: ReturnType<typeof parseChatRoute>, search: string) {
  // P1631: Clarify opens the Mirror's thread beside the chat the person is in (?clarify=<root>); closing only removes the parameter.
  const { clarifyRoot, closeClarify } = useClarifyPanel();
  // open only when a panel will really render: a ?clarify= with no Mirror to show it in must not capture Escape
  const clarifyShown = !!clarifyRoot && chats.some((c) => c.kind === 'mirror');
  // P1631: "Points in this chat" (?points=1) beside the chat; the Clarify panel wins when both are asked for.
  const closePoints = useClosePointsPanel();
  const pointsShown = !clarifyShown && pointsPanelShown(search) && !!summary && summary.kind !== 'mirror';
  const threadOpen = !!route.rootId || clarifyShown || pointsShown;
  const back = useBack();
  const closeThread = clarifyShown ? closeClarify : pointsShown ? closePoints : back;
  useFinishLeave();
  useEffect(() => {
    if (!threadOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) closeThread();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [threadOpen, closeThread]);

  const side = pointsShown ? null : sidePanelOf(chats, summary, route.rootId, clarifyRoot);
  return { side, pointsShown, showThread: side !== null || pointsShown, closeClarify, closePoints };
}

type SidePanel = ReturnType<typeof useSidePanels>['side'];

/**
 * P1631 (AC 137): Clarify pressed from an open thread, from 1280px. The Mirror is on the right and the thread takes the left area, where "← Chat" puts the
 * main chat back. The thread stays in the address the whole time, so × on the Mirror (which removes only ?clarify=) brings back the layout from before:
 * the chat, with the thread open on the right. "← Chat" holds for this one Mirror thread and source thread, until the Mirror closes.
 * A left thread that turns out unavailable (its first message deleted) leaves the address on the chat, with the Mirror still open.
 */
export function useLeftThread(side: SidePanel, summary: ChatSummary | undefined, rootId: string | null | undefined, wide: boolean) {
  const navigate = useNavigate();
  const { search, state } = useLocation();
  const key = wide && side?.clarify && summary && rootId ? `${side.rootId}:${rootId}` : null;
  const [chatBackFor, setChatBackFor] = useState<string | null>(null);
  // the Mirror closed (or the screen narrowed): a later Clarify from the same thread starts in the left layout again
  if (key === null && chatBackFor !== null) setChatBackFor(null);
  const backToChat = useCallback(() => setChatBackFor(key), [key]);
  const conversationId = summary?.conversationId;
  const leaveThread = useCallback(() => {
    if (!conversationId) return;
    const params = new URLSearchParams(search);
    params.delete('m'); // a message of the thread that is gone: nothing to focus in the chat
    const rest = params.toString();
    navigate({ pathname: chatPath(conversationId), search: rest ? `?${rest}` : '' }, { replace: true, state });
  }, [navigate, conversationId, search, state]);
  const thread = key && summary && rootId && chatBackFor !== key ? { summary, rootId } : null;
  return { leftThread: thread, backToChat, leaveThread };
}

/**
 * P1631: one policy for a conversation hidden behind its left thread. It is not viewed (its pane is not mounted), so nothing marks it read and its new
 * messages count as unread. The provider's 60 s safety re-read runs only for a viewed conversation, so this page runs the same re-read (the chat list,
 * then the open views) while the left thread is shown, in its place; Realtime and the focus and reconnect re-reads go on as everywhere.
 */
export function useKeepFresh(active: boolean) {
  const chat = useContext(ChatContext);
  const refresh = chat?.refresh;
  const resync = chat?.resync;
  useEffect(() => {
    if (!active || !refresh || !resync) return;
    // what the provider's own timer does for a viewed conversation (chat-provider.tsx, its resync): the list (names, unread counts), then the open views.
    // A list read still on its way skips the tick, so slow reads never pile up; a failed one is left to the next tick.
    let busy = false;
    const timer = setInterval(() => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      void Promise.resolve()
        .then(refresh)
        .catch(() => null)
        .finally(() => { busy = false; });
      resync();
    }, SAFETY_POLL_MS);
    return () => clearInterval(timer);
  }, [active, refresh, resync]);
}

/**
 * P1631 (AC 137): which open route thread is a Clarify thread (reported by its panel once the root is read: null until then), so a Clarify thread opened
 * from the Mirror chat itself covers the page below 1280px like the Clarify panel does. Every other thread keeps the side panel from 1024px.
 * `routeClarifyUnknown`: a Mirror-chat thread whose root is not read yet. Only the Mirror chat holds Clarify threads, so no other chat waits.
 */
export function useRouteClarify(side: SidePanel) {
  const [reported, setReported] = useState<{ rootId: string; is: boolean | null } | null>(null);
  const rootId = side && !side.clarify ? side.rootId : null;
  const onClarifyThread = useCallback((is: boolean | null) => { if (rootId) setReported({ rootId, is }); }, [rootId]);
  const known = rootId !== null && reported?.rootId === rootId && reported.is !== null;
  return {
    routeClarify: known && reported?.is === true,
    routeClarifyUnknown: rootId !== null && side?.summary.kind === 'mirror' && !known,
    onClarifyThread,
  };
}
