/**
 * @file use-voice-sender.ts
 * @description P1576 Part B: binds a pane to `sendVoiceNote`. The composer hands it a recorded WAV; this
 * sends it to the pane's conversation (and thread, and reply; `resume` re-commits a stored upload), then asks the open chats to re-read so
 * the note appears even if its Realtime insert is missed.
 */
import { useCallback, useRef } from 'react';
import { sendVoiceNote } from '@/app/data/chat-service';
import type { VoiceAttempt, VoiceSender } from '@/hooks/use-voice-note';
import { useChat } from './chat-state';

/**
 * @param enabled false: the composer then shows no voice button
 * @param threadRootId set inside a thread panel
 * @param replyToId the pending reply, if any
 * @param onSent runs once the note was accepted (clears a pending reply)
 */
export function useVoiceSender(
  conversationId: string,
  enabled: boolean,
  threadRootId: string | undefined,
  replyToId: string | undefined,
  onSent?: () => void,
): VoiceSender | undefined {
  const { resync } = useChat();
  const latest = useRef({ replyToId, onSent });
  latest.current = { replyToId, onSent };
  const send = useCallback(
    async (wav: Blob, attempt?: VoiceAttempt) => {
      await sendVoiceNote(conversationId, wav, { threadRootId, replyToId: latest.current.replyToId, resume: attempt?.resume });
      latest.current.onSent?.();
      resync();
    },
    [conversationId, threadRootId, resync],
  );
  return enabled ? send : undefined;
}
