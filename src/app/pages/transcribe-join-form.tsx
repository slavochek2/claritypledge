/**
 * @file transcribe-join-form.tsx
 * @description The join view's content (what is recorded, the error, the Join button, the terms line), inside the same frame as the room.
 * Split out of transcribe-room-page.tsx (its size limit).
 */
import { useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConsentSection } from '@/app/pages/ConsentLabel';
import { DISCLOSURE_ID, useRoomDisclosure } from '@/app/pages/use-room-disclosure';
import { ROOM_CHECK_RETRY } from '@/app/components/session/capture-copy';

export function TranscribeJoinForm({ urlCode, joinError, joining, onJoin }: {
  urlCode: string | undefined;
  joinError: string | null;
  joining: boolean;
  onJoin: () => void;
}) {
  // Join waits for the disclosure line, so nobody joins before seeing who can read the transcript.
  const { state, mastermind, settled, pending, retry } = useRoomDisclosure(urlCode);
  const intro = useRef<HTMLParagraphElement>(null);
  // The Try again button leaves the page when it is pressed, so focus moves to the line that announces the new check.
  const tryAgain = () => { retry(); intro.current?.focus(); };
  return (
    <div className="max-w-md pt-2">
      <h1 className="text-xl font-semibold mb-2 font-['Playfair_Display']">Join the transcription room</h1>
      <ConsentSection state={state} mastermind={mastermind} introRef={intro} />

      {joinError && <p className="text-sm text-red-600 mb-4" data-testid="transcribe-join-error">{joinError}</p>}

      {state === 'failed' ? (
        // no dead controls: while the check has failed there is no Join, the one action is trying again
        <Button type="button" onClick={tryAgain} disabled={pending} className="w-full min-h-11" data-testid="transcribe-room-retry">{ROOM_CHECK_RETRY}</Button>
      ) : state === 'unknown' ? null : (
        <Button onClick={onJoin} disabled={joining || !settled} aria-describedby={DISCLOSURE_ID} className="w-full min-h-11" data-testid="transcribe-join-button">
          {joining ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {joining ? 'Joining...' : 'Join room'}
        </Button>
      )}

      <p className="text-xs text-muted-foreground text-center mt-4">
        By joining, you agree to our{' '}
        <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Terms</a>{' '}
        and{' '}
        <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Privacy Policy</a>.
      </p>
    </div>
  );
}
