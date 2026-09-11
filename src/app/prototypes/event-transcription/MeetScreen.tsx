/**
 * @file MeetScreen.tsx
 * @description P1307 clickable prototype — a labelled STAND-IN for the real event meet page
 * (`EventRoomMeet.tsx`), which this spec does not change. It deliberately shows no invented
 * roster or layout: the only things demonstrated here are the cross-page `TranscriptionBar`
 * at the top and a mock entry into a practice session (the real page's practice rooms).
 *
 * When transcription is OFF there is no bar, and the back link returns to the ready screen so
 * the founder's "can they go back and switch it on?" is demonstrably yes.
 */
import { FocusHeader } from '@/app/components/layout/focus-header';
import { Button } from '@/components/ui/button';
import { TranscriptionBar } from './TranscriptionBar';

export function MeetScreen({
  onBack,
  transcriptionActive,
  onOpenTranscript,
  onEndTranscription,
  onJoinPractice,
}: {
  onBack: () => void;
  transcriptionActive: boolean;
  onOpenTranscript: () => void;
  onEndTranscription: () => void;
  onJoinPractice: () => void;
}) {
  return (
    <div data-testid="proto-room-meet">
      {transcriptionActive && (
        <TranscriptionBar onOpen={onOpenTranscript} onEnd={onEndTranscription} />
      )}

      <div className="mx-auto w-full max-w-2xl px-4 py-6">
        <FocusHeader onBack={onBack} label="Back" aria-label="Back to readiness" />

        <div className="rounded-xl border-2 border-dashed border-border p-6 text-center space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Stand-in</p>
          <p className="text-sm text-foreground">
            The real event page (/meet) — unchanged by this spec.
          </p>
          <p className="text-sm text-muted-foreground">
            The bar above is what gets added, on this page and every other page.
          </p>
        </div>

        <div className="mt-6">
          <Button
            onClick={onJoinPractice}
            size="lg"
            variant="outline"
            className="w-full min-h-11"
            data-testid="join-practice-session"
          >
            Join practice session (stand-in for the page's practice rooms)
          </Button>
        </div>
      </div>
    </div>
  );
}
