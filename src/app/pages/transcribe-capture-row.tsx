/**
 * @file transcribe-capture-row.tsx
 * @description P1388 / P1604: the recorder's parts on the room page. The header carries the controls (info, Pause, Stop: one row with
 * the Back); this row carries the meter and the faces and the ONE status line under the header. Split out of transcribe-room-page.tsx
 * (its size limit).
 */
import type { ReactNode } from 'react';
import { CaptureInfoButton, PauseResumeButton, SessionStopButton, StopCaptureButton } from '@/app/components/session/capture-controls';
import { useCaptureStatus } from '@/app/components/session/capture-status';
import { CaptureLevelMeter } from '@/app/components/session/capture-level-meter';
import { LISTENING_LINE } from '@/app/components/session/capture-copy';
import { useRoomCapture } from '@/app/contexts/room-capture-context';

/** The right-hand end of the header row: what the page is for while a capture runs. */
export function RoomHeaderActions({ onStop, readOnly = false }: { onStop: () => void; readOnly?: boolean }) {
  const { phase, eventId } = useRoomCapture();
  // Joined but the microphone could not open: nothing to pause or stop, only a way out that ends nothing.
  if (readOnly) return <SessionStopButton label="Leave" onClick={onStop} testId="transcribe-end-session-button" />;
  return (
    <>
      <CaptureInfoButton forEvent={!!eventId} />
      {(phase === 'capturing' || phase === 'stalled' || phase === 'paused') && <PauseResumeButton />}
      <StopCaptureButton onClick={onStop} testId="transcribe-end-session-button" />
    </>
  );
}

/** Meter and faces on one line, the status under them. Anything not healthy (paused, stalled, no sound, mic gone) replaces the line. */
export function TranscribeCaptureRow({ people }: { people: ReactNode }) {
  const { phase } = useRoomCapture();
  const status = useCaptureStatus();
  const healthy = !status.warn && phase !== 'paused';
  return (
    <div className="mb-2" data-testid="transcribe-listening-indicator" role="status">
      <div className="flex flex-wrap items-center gap-2">
        {phase !== 'observing' && <CaptureLevelMeter active={phase === 'capturing' || phase === 'stalled'} />}
        {people}
      </div>
      <p
        className={`text-xs mt-1 ${status.warn ? 'font-semibold text-red-800' : 'text-muted-foreground'}`}
        data-testid={phase === 'stalled' && status.warn ? 'transcribe-mic-error' : undefined}
      >
        {healthy ? LISTENING_LINE : status.text}
      </p>
    </div>
  );
}
