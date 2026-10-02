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
import { Info, Pause, Play } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useRoomCapture } from '@/app/contexts/room-capture-context';


export function PauseResumeButton() {
  const { phase, manualPaused, pauseMine, resumeMine, micLost } = useRoomCapture();
  if (phase === 'observing') return null; // another tab holds the mic; it pauses there
  if (micLost) return null; // nothing to pause; Stop transcribing is the action
  const paused = phase === 'paused' && manualPaused;
  return (
    <button
      type="button"
      onClick={paused ? resumeMine : pauseMine}
      aria-pressed={paused}
      data-testid={paused ? 'capture-resume' : 'capture-pause'}
      className="flex items-center gap-1.5 whitespace-nowrap text-sm font-medium rounded-md h-10 px-3 border border-blue-300 bg-white text-blue-900 hover:bg-blue-100 transition-colors"
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
        {/* [FOUNDER DECISION: the wording inside the info sheet — PROPOSED] */}
        <p><span className="font-medium">What’s recorded:</span> your microphone, while this says Transcribing. Paused records nothing.</p>
        <p><span className="font-medium">Where it goes:</span> the text appears for everyone in this room, and the audio is kept so the whole conversation can be transcribed afterwards.</p>
        <p><span className="font-medium">Your part:</span> you’re the one recording, so let the people around you know, and pause whenever someone asks.</p>
        <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Privacy policy</a>
      </PopoverContent>
    </Popover>
  );
}
