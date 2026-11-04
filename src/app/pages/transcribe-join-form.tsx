/**
 * @file transcribe-join-form.tsx
 * @description The join view's content (consent, the error, the Join button, the terms line), inside the same frame as the room.
 * Split out of transcribe-room-page.tsx (its size limit).
 */
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConsentSection } from '@/app/pages/ConsentLabel';

export function TranscribeJoinForm({ consentGiven, onToggle, urlCode, joinError, joining, onJoin }: {
  consentGiven: boolean;
  onToggle: () => void;
  urlCode: string | undefined;
  joinError: string | null;
  joining: boolean;
  onJoin: () => void;
}) {
  return (
    <div className="max-w-md pt-2">
      <h1 className="text-xl font-semibold mb-2 font-['Playfair_Display']">Join the transcription room</h1>
      <ConsentSection agreed={consentGiven} code={urlCode} onToggle={onToggle} />

      {joinError && <p className="text-sm text-red-600 mb-4" data-testid="transcribe-join-error">{joinError}</p>}

      <Button onClick={onJoin} disabled={!consentGiven || joining} className="w-full min-h-11" data-testid="transcribe-join-button">
        {joining ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        {joining ? 'Joining...' : 'Join room'}
      </Button>

      <p className="text-xs text-muted-foreground text-center mt-4">
        By joining, you agree to our{' '}
        <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Terms</a>{' '}
        and{' '}
        <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">Privacy Policy</a>.
      </p>
    </div>
  );
}
