/**
 * @file PreparationBanner.tsx
 * @description P1529 UAT round 2: a canvas started from an event's preparation says so, in one short line, with a back arrow to the preparation.
 * Blue like the room's Transcribe bar (room-capture-bar.tsx); never a second primary. Wording is DRAFT: [FOUNDER DECISION: copy, proposed].
 */
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { PrepStep } from '@/lib/canvas-hrefs';
import { usePreparationStep } from './use-preparation-return';

/** `step`: the preparation's real step and length when the navigation state carried them; without them the line names no number. */
export function PreparationBanner({ to, step }: { to: string; step?: PrepStep | null }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-1 border-b border-blue-200 bg-blue-50 px-4 py-1 dark:border-blue-900 dark:bg-blue-950" data-testid="preparation-banner">
      <button
        type="button"
        onClick={() => navigate(to)}
        aria-label="Back to preparation"
        data-testid="preparation-banner-back"
        className="-ml-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-blue-900 dark:text-blue-100 transition-colors hover:bg-blue-100 dark:hover:bg-blue-900"
      >
        <ArrowLeft size={20} />
      </button>
      {/* [FOUNDER DECISION: copy, proposed] */}
      <span className="min-w-0 text-sm font-medium text-blue-900 dark:text-blue-100">{step ? `Step ${step.step} of ${step.total} · Publish, then share` : 'Your Clarity Canvas · Publish, then share'}</span>
    </div>
  );
}

/** The workspace's banner: reads and remembers the step from the navigation state. */
export function WorkspacePreparationBanner({ to, state, canvasKey }: { to: string; state: unknown; canvasKey: string }) {
  return <PreparationBanner to={to} step={usePreparationStep(state, canvasKey)} />;
}
