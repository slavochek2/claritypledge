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
          <span className="text-2xl text-muted-foreground" aria-hidden="true">✕</span>
        </div>

        <h1 className="text-2xl font-bold mb-3">Invitation Declined</h1>

        <p className="text-muted-foreground mb-8">
          You declined this agreement. This page is no longer active.
        </p>

        <a
          href="https://claritypledge.com"
          className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
        >
          Learn about Clarity Pledge →
        </a>
      </div>
    </div>
  );
}
