/**
 * @file room-capture-resume.ts
 * @description Resume after a reload that came back paused (P1604): no microphone is open yet, so Resume opens it. If the person
 * paused again while it was opening, the late stream is closed (a stop is already handled inside startMedia by its generation
 * check); the next Resume opens it again. Split out of room-capture-context.tsx (its size limit).
 */
import type { MutableRefObject } from 'react';

export async function openMicOnResume(
  roomId: string,
  startMedia: (roomId: string) => Promise<void>,
  media: { stream: MediaStream | null },
  pausedRef: MutableRefObject<boolean>,
  onFail: () => void,
): Promise<void> {
  try {
    await startMedia(roomId);
    if (pausedRef.current && media.stream) {
      media.stream.getTracks().forEach((t) => t.stop());
      media.stream = null;
    }
  } catch (err) {
    console.error('[room-capture] could not open the microphone on resume:', err);
    onFail();
  }
}
