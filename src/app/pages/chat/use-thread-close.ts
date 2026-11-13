/**
 * @file use-thread-close.ts
 * @description What closes a thread panel, moved out of ThreadPanel unchanged: the caller's own close (the canvas page; the left area's leave), else the
 * left area's "← Chat", else the chat's Back. A thread that does not exist for this person (a reply, a 1:1, another chat's message) closes itself.
 */
import { useEffect } from 'react';
import { useBack } from './chat-hooks';

export function useThreadClose(status: string, onClose?: () => void, onBackToChat?: () => void): () => void {
  const back = useBack();
  const close = onClose ?? onBackToChat ?? back;
  useEffect(() => {
    if (status === 'unavailable') close();
  }, [status, close]);
  return close;
}
