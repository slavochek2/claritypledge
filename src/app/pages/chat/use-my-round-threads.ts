/**
 * @file use-my-round-threads.ts
 * @description P1592: the viewer's round threads in an event channel, for the "My rounds" filter.
 *
 * Visibility needs no per-message work: one read when the channel opens, and one more only when a
 * round thread's root post arrives in THIS channel (a system post, a rare event: one per round and
 * table, or a title change). Transcription appends and typed messages never trigger it.
 */
import { useEffect, useState } from 'react';
import { getMyRoundThreads, type RoundThread } from '@/app/data/chat-round-threads';
import { useChat } from './chat-state';

export function useMyRoundThreads(conversationId: string, enabled: boolean): RoundThread[] {
  const { subscribe } = useChat();
  // Tagged with the conversation it was loaded for: a list is only ever returned for that conversation, so a
  // switch (or a failed load after one) can never show another event's rounds.
  const [loaded, setLoaded] = useState<{ conversationId: string; threads: RoundThread[] }>({ conversationId, threads: [] });
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    let latest = 0; // loads overlap and answer in any order: only the newest request's answer is applied
    const load = () => {
      const mine = ++latest;
      getMyRoundThreads(conversationId).then(
        (rows) => live && mine === latest && setLoaded({ conversationId, threads: rows }),
        () => undefined, // a filter that cannot load is simply not shown
      );
    };
    load();
    const off = subscribe((e) => {
      if (e.type === 'resync') load();
      else if (e.type === 'message' && e.event.message.systemKind === 'round_thread' && e.event.message.conversationId === conversationId) load();
    });
    return () => {
      live = false;
      off();
    };
  }, [conversationId, enabled, subscribe]);
  return enabled && loaded.conversationId === conversationId ? loaded.threads : [];
}
