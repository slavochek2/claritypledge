/**
 * @file PracticeScreen.tsx
 * @description P1307 clickable prototype — mock /live-style practice session screen.
 * `TranscriptionBar` is deliberately NOT rendered here (no "paused" message either) — the
 * caller (EventTranscriptionPrototype) simply doesn't mount it on this screen, matching the
 * brief: "While on this screen the transcription bar is HIDDEN (no 'paused' message at all)."
 */
import { Button } from '@/components/ui/button';

export function PracticeScreen({ onEndSession }: { onEndSession: () => void }) {
  return (
    <div
      data-testid="proto-practice-session"
      className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center px-4 py-10 gap-6"
    >
      <div className="text-center space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Stand-in for the real /live session — unchanged except the label below
        </p>
        <h1 className="text-2xl font-semibold">Practice session</h1>
        <p className="text-sm text-muted-foreground" data-testid="practice-banner">
          Session transcribed for AI insights
        </p>
      </div>

      <Button
        onClick={onEndSession}
        size="lg"
        variant="outline"
        className="min-h-11 px-8"
        data-testid="end-practice-session"
      >
        End session
      </Button>
    </div>
  );
}
