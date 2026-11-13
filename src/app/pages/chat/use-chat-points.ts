/**
 * @file use-chat-points.ts
 * @description P1631: the live point cards of one chat, for the "Points in this chat (N)" menu item and its panel. One read when the chat opens,
 * and one more when a point card arrives in THIS chat (or after a resync). Reloads when a point card arrives, or when any message of this chat is updated (a deleted card arrives as an UPDATE) and was or is a point card.
 * status: 'loading' | 'error' | 'ready'; the menu item shows for 'ready' with rows only, the panel draws loading and error (with retry).
 */
import { useCallback, useContext, useEffect, useState } from 'react';
import { listChatPoints, type ChatPointRow } from '@/app/data/chat-points-service';
import { ChatContext } from './chat-state';

export interface ChatPointsState {
  status: 'loading' | 'error' | 'ready';
  rows: ChatPointRow[];
  retry: () => void;
}

type Loaded = { conversationId: string; status: 'error' | 'ready'; rows: ChatPointRow[] };

export function useChatPoints(conversationId: string, enabled: boolean): ChatPointsState {
  const subscribe = useContext(ChatContext)?.subscribe; // absent outside the provider (a test that does not mount it): the first read still happens
  // Tagged with the conversation it was loaded for, so a switch can never show another chat's points.
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => {
    setLoaded(null);
    setTick((t) => t + 1);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let latest = 0; // loads overlap and answer in any order: only the newest request's answer is applied
    const load = () => {
      const mine = ++latest;
      listChatPoints(conversationId).then(
        (rows) => live && mine === latest && setLoaded({ conversationId, status: 'ready', rows }),
        () => live && mine === latest && setLoaded((now) => (now?.conversationId === conversationId && now.status === 'ready' ? now : { conversationId, status: 'error', rows: [] })),
      );
    };
    load();
    const off = subscribe?.((e) => {
      if (e.type === 'resync') load();
      else if (e.type === 'message' && e.event.message.conversationId === conversationId) {
        const m = e.event.message;
        if (m.attachmentKind === 'point' || (e.event.type === 'UPDATE' && m.isDeleted)) load();
      }
    });
    return () => {
      live = false;
      off?.();
    };
  }, [conversationId, enabled, subscribe, tick]);
  const mine = enabled && loaded?.conversationId === conversationId ? loaded : null;
  return { status: mine?.status ?? 'loading', rows: mine?.rows ?? [], retry };
}
