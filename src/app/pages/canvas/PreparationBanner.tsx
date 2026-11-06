/**
 * @file PreparationBanner.tsx
 * @description P1529 UAT round 2: a canvas started from an event's preparation says so, and that Publish finishes the step. A quiet link
 * back; never a second primary. Wording is DRAFT: [FOUNDER DECISION: copy, proposed].
 */
import { useNavigate } from 'react-router-dom';

export function PreparationBanner({ to }: { to: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 border-b bg-muted/50 px-4 py-2 text-sm" data-testid="preparation-banner">
      {/* [FOUNDER DECISION: copy, proposed] */}
      <span>You&apos;re preparing for the event. Draft your canvas with your mirror, then publish it to finish this step.</span>
      <button type="button" className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4" onClick={() => navigate(to)} data-testid="preparation-banner-back">
        Back to preparation
      </button>
    </div>
  );
}
