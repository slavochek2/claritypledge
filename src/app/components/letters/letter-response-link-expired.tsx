/**
 * @file letter-response-link-expired.tsx
 * @description P684 State 9: Shown when the confirm route finds no pending row.
 * The magic link has expired or the pending row was never written.
 * Reader is already authenticated — the "Open the letter" CTA sends them back to
 * the one-to-many reading page as a logged-in reader (State 2 direct-submit path).
 */

import { Link } from 'react-router-dom';

interface LetterResponseLinkExpiredProps {
  letterId: string;
  senderName?: string;
}

export function LetterResponseLinkExpired({ letterId }: LetterResponseLinkExpiredProps) {
  return (
    <div className="max-w-md mx-auto w-full flex flex-col items-center gap-4 px-4 text-center py-16">
      <h1 className="text-lg font-semibold text-[#1A1A1A]">
        This sign-in link has expired
      </h1>
      <p className="text-sm text-muted-foreground">
        Please read the letter again to re-enter your responses.
      </p>
      <Link
        to={`/letter/${letterId}`}
        className="text-sm text-[#0044CC] hover:underline mt-2"
      >
        Open the letter
      </Link>
    </div>
  );
}
