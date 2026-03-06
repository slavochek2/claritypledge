/**
 * @file declined-agreement-page.tsx
 * @description Static page shown when a user declines a Clarity Partner agreement.
 * Route: /agreements/:id/declined
 */

export function DeclinedAgreementPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
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
          className="text-[#002B5C]/60 hover:text-[#002B5C] hover:underline inline-flex items-center gap-1 text-sm"
        >
          What is ClarityPledge?
        </a>
      </div>
    </div>
  );
}
