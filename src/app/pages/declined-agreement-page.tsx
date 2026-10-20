/**
 * @file declined-agreement-page.tsx
 * @description Static page shown when a user declines a Clarity Partner agreement.
 * Route: /agreements/:id/declined
 */

import { FocusHeader } from '@/app/components/layout/focus-header';

export function DeclinedAgreementPage() {
  return (
    <div className="min-h-screen flex flex-col px-4">
      {/* P1512: this page hides the phone bottom bar, so it keeps a Back (the shell top bar when signed in). */}
      <div className="pt-4 empty:hidden">
        <FocusHeader fallback="/feed" />
      </div>
      <div className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-6">
          <span className="text-2xl text-muted-foreground" aria-hidden="true">—</span>
        </div>

        <h1 className="text-2xl font-bold mb-3">You've declined the invitation</h1>

        <p className="text-muted-foreground mb-4">
          This agreement has been closed. Your partner has been notified.
        </p>

        <p className="text-muted-foreground/70 text-sm mb-8">
          If you change your mind, reach out to them directly — they can always send a new invitation.
        </p>

        <a
          href="https://claritypledge.com"
          className="text-blue-600/60 hover:text-blue-600 hover:underline inline-flex items-center gap-1 text-sm"
        >
          What is ClarityPledge?
        </a>
      </div>
      </div>
    </div>
  );
}
