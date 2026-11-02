/**
 * @file use-thread-voice.ts
 * @description The round voice button's sender for a thread panel. An ordinary thread sends the note as a reply in the thread (P1576). A canvas
 * draft's thread (P1536 3c X9) sends it as the draft's update through `canvasVoice` (use-canvas-actions: the draft's id and the revision read when
 * it runs), and asks the open chats to re-read so the note appears even if its realtime insert is missed. No sender (the draft cannot take a
 * note yet, drafting is off) means no button.
 */
import { useCallback } from 'react';
import type { VoiceAttempt, VoiceSender } from '@/hooks/use-voice-note';
import { useChat } from './chat-state';
import { useVoiceSender } from './use-voice-sender';

export function useThreadVoice(conversationId: string, rootId: string, canvasRoot: boolean, canvasVoice: VoiceSender | null): VoiceSender | undefined {
  const { resync } = useChat();
  const plain = useVoiceSender(conversationId, !canvasRoot, rootId, undefined);
  const forCanvas = useCallback(async (wav: Blob, attempt?: VoiceAttempt) => {
    await canvasVoice?.(wav, attempt);
    resync();
  }, [canvasVoice, resync]);
  if (!canvasRoot) return plain;
  return canvasVoice ? forCanvas : undefined;
}
