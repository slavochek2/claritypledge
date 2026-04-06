/**
 * @file letter-seal-confirmation.tsx
 * @description P661: Ceremonial "Letter Sealed" confirmation screen.
 */

import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { LetterMode } from '@/app/types';

interface LetterSealConfirmationProps {
  docId: string;
  receiverName: string;
  mode: LetterMode;
  storyCount: number;
}

export function LetterSealConfirmation({
  docId,
  receiverName,
  mode,
  storyCount,
}: LetterSealConfirmationProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-sm">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-50 mb-2">
          <span className="text-3xl">&#10022;</span>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground">Letter Sealed</h2>
          <p className="text-muted-foreground">
            {mode === 'one-to-one'
              ? `Sent to ${receiverName}`
              : 'Ready to share'}
          </p>
          <p className="text-sm text-muted-foreground">
            {storyCount} {storyCount === 1 ? 'story' : 'stories'}
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          You&apos;ll see {mode === 'one-to-one' ? `${receiverName}'s` : 'responses as readers'} read.
        </p>

        <Button
          variant="outline"
          onClick={() => navigate(`/d/${docId}`)}
        >
          Back to Doc
        </Button>
      </div>
    </div>
  );
}
