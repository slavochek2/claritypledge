/**
 * @file capture-controls.tsx
 * @description P1388: the recorder's controls, shared by the capture bar and the /transcribe
 * room page (which claims the bar's slot and draws its own chrome — P1323 R6), so the two
 * surfaces say the same thing in the same words.
 *
 *   - captureStatusText: one line that says what is actually happening — recording, paused,
 *     no sound, or the mic gone. Every failure here is silent, so the line must name it.
 *   - PauseResumeButton: the recorder's own pause. Pause stops the recorder writing.
 *   - CaptureInfoButton: ⓘ — what is captured, where it goes, the recorder's part. Read by
 *     the people who care, invisible to everyone else; the bar carries no added sentence.
 */
import { ArrowRight, Info, Mic, Pause, Play, Square } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useRoomCapture } from '@/app/contexts/room-capture-context';


/** P1388 (founder, 2026-10-02): one compact row — Pause and Stop together as the recording
 *  controls, Open apart at the end as navigation. Equal weight; no full-width primary. */
const CONTROL_CLASS =
  'flex items-center gap-1.5 whitespace-nowrap text-sm font-medium rounded-md h-10 px-3 border border-blue-300 bg-white text-blue-900 hover:bg-blue-100 transition-colors disabled:opacity-50';

/** A square, not the LogOut door: this stops something, it leaves nothing. Neutral at rest,
 *  destructive on hover/focus — P1323 R7's End treatment, kept. Presentational, so the /live
 *  bar uses the same control (P1388: one compact row across both bars). */
export function SessionStopButton({ onClick, label, ariaLabel, disabled, testId }: {
  onClick: () => void; label: string; ariaLabel?: string; disabled?: boolean; testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      data-testid={testId}
      className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium rounded-md h-10 px-3 border border-blue-300 bg-white text-blue-900 hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5 focus-visible:text-destructive focus-visible:bg-destructive/5 transition-colors disabled:opacity-50 disabled:pointer-events-none"
    >
      <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
      {label}
    </button>
  );
}

/** Navigation, set apart at the end of the row with an arrow (Open / Rejoin). */
export function SessionGoButton({ onClick, label, disabled, testId }: { onClick: () => void; label: string; disabled?: boolean; testId?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testId} className={`${CONTROL_CLASS} ml-auto`}>
      {label}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

/** Visible "Stop" sits inside the accessible name "Stop transcribing" (label-in-name). */
export function StopCaptureButton({ onClick, label = 'Stop', testId }: { onClick: () => void; label?: string; testId?: string }) {
  const { stopping } = useRoomCapture();
  return (
    <SessionStopButton onClick={onClick} label={stopping ? 'Stopping…' : label} ariaLabel="Stop transcribing" disabled={stopping} testId={testId} />
  );
}

export function OpenRoomButton({ onClick, testId }: { onClick: () => void; testId?: string }) {
  const { stopping } = useRoomCapture();
  return <SessionGoButton onClick={onClick} label="Open" disabled={stopping} testId={testId} />;
}

export function PauseResumeButton() {
  const { phase, manualPaused, pauseMine, resumeMine, micLost, stopping, reconnectMic } = useRoomCapture();
  if (phase === 'observing') return null; // another tab holds the mic; it pauses there
  if (micLost) {
    // Nothing to pause. Capture comes back only on this tap — never on its own.
    return (
      <button type="button" onClick={() => void reconnectMic()} disabled={stopping} data-testid="capture-reconnect" className={CONTROL_CLASS}>
        <Mic className="h-4 w-4" aria-hidden="true" />
        Reconnect mic
      </button>
    );
  }
  // Paused by the app, not the person: their Pause/Resume does not apply, so it is not offered.
  if (phase === 'paused' && !manualPaused) return null;
  const paused = phase === 'paused' && manualPaused;
  return (
    <button
      type="button"
      onClick={paused ? resumeMine : pauseMine}
      disabled={stopping}
      aria-pressed={paused}
      data-testid={paused ? 'capture-resume' : 'capture-pause'}
      className={CONTROL_CLASS}
    >
      {paused ? <Play className="h-4 w-4" aria-hidden="true" /> : <Pause className="h-4 w-4" aria-hidden="true" />}
      {paused ? 'Resume' : 'Pause'}
    </button>
  );
}

export function CaptureInfoButton() {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="About this recording"
        data-testid="capture-info"
        className="inline-flex items-center justify-center h-10 w-10 -my-2 rounded-full text-blue-700 hover:bg-blue-100"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent className="text-sm space-y-2" data-testid="capture-info-sheet">
        {/* Wording approved by the founder 2026-10-02. */}
        <p><span className="font-medium">What’s recorded:</span> your microphone, while this says Transcribing. Paused records nothing.</p>
        <p><span className="font-medium">Where it goes:</span> the text appears for everyone in this room, and the audio is kept so the whole conversation can be transcribed afterwards.</p>
        <p><span className="font-medium">Your part:</span> you’re the one recording, so let the people around you know, and pause whenever someone asks.</p>
        <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Privacy policy</a>
      </PopoverContent>
    </Popover>
  );
}
