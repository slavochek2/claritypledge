/**
 * P1520: the viewer's own @mirror asks in one channel, and the mirror's answers to them.
 *
 * These rows live in the viewer's MIRROR (tagged with the channel), so the channel's own list never
 * holds them and nobody else can read them. This hook reads them through RLS, keeps them current from
 * the same Realtime stream (an own-mirror row tagged with this channel), and re-reads on resync.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/app/data/chat-service';
import { listMirrorAsks } from '@/app/data/mirror-service';
import { useChat } from './chat-state';
import { upsertMessage } from './chat-view-model';

export function useMirrorAsks(channelId: string, enabled: boolean): ChatMessage[] {
  const { subscribe } = useChat();
  const [rows, setRows] = useState<ChatMessage[]>([]);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const g = ++generation.current;
    try {
      const next = await listMirrorAsks(channelId);
      if (g === generation.current) setRows(next);
    } catch {
      /* keep what is shown; the next resync retries */
    }
  }, [channelId]);

  useEffect(() => {
    const gen = generation;
    setRows([]);
    if (enabled) void load();
    return () => {
      gen.current++; // a read for the previous channel lands nowhere
    };
  }, [enabled, load]);

  useEffect(() => {
    if (!enabled) return;
    return subscribe((e) => {
      if (e.type === 'resync') {
        void load();
        return;
      }
      const m = e.type === 'sent' ? e.message : e.event.message;
      if (m.contextConversationId !== channelId) return;
      setRows((prev) => upsertMessage(prev, m));
    });
  }, [enabled, subscribe, channelId, load]);

  return rows;
}
