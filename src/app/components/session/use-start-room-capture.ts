/**
 * @file use-start-room-capture.ts
 * @description The ONE way a person starts transcribing in an event room: the tap on the room's Transcribe bar and the sales
 * mastermind's "Start your mic" both call it. The tap is the consent (the join records it); `onFailed` runs when the join or the
 * microphone did not open, so each caller says it in its own place.
 */
import { useCallback, useState } from 'react';
import { useRoomCapture } from '@/app/contexts/room-capture-context';

export function useStartRoomCapture(eventId: string, displayName: string, onFailed: () => void): { start: () => void; starting: boolean } {
  const { startCapture } = useRoomCapture();
  const [starting, setStarting] = useState(false);
  const start = useCallback(() => {
    setStarting(true);
    void startCapture({ eventId, displayName })
      .then(result => { if (!result.started) onFailed(); })
      .catch(() => onFailed())
      .finally(() => setStarting(false));
  }, [startCapture, eventId, displayName, onFailed]);
  return { start, starting };
}
