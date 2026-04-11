/**
 * @file letter-recipient-done.tsx
 * @description P683: Simplified completion screen for 1-to-1 letter recipients.
 * No CTAs — the recipient's job is done once their responses are recorded.
 */

import { CheckCircle } from 'lucide-react';

interface LetterRecipientDoneProps {
  senderName: string;
}

export function LetterRecipientDone({ senderName }: LetterRecipientDoneProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center py-10">
      <div className="mb-6 w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
        <CheckCircle className="w-10 h-10 text-green-600" aria-hidden="true" />
      </div>
      <div className="space-y-3 max-w-md">
        <p className="text-lg text-[#1A1A1A]">
          Your responses have been shared with {senderName}.
        </p>
        <p className="text-sm text-[#1A1A1A]/70">
          They&rsquo;ll see how your perspective compared to theirs.
        </p>
        <p className="text-sm text-[#1A1A1A]/50">
          You can close this tab.
        </p>
      </div>
    </div>
  );
}
