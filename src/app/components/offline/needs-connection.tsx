/**
 * @file needs-connection.tsx
 * @description P1369: the page body for "this can't be shown offline" — a page never visited
 * (nothing cached), a live multi-person page (/meet, /ready: no stale presence), or a page whose
 * code was never downloaded. Headline, one line, "Try again", "Go to home".
 *
 * Mounting it reports `needs-connection` to the offline strip, so the strip reads "Offline".
 * Copy — UI Contract, [FOUNDER DECISION: copy — PROPOSED].
 */
import { Link } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOfflinePageReport } from '@/app/contexts/offline-status-context';

export const NEEDS_CONNECTION_DEFAULT_TITLE = 'This page needs a connection';
export const NEEDS_CONNECTION_LINE = "It loads by itself when you're back online.";

interface NeedsConnectionProps {
  title?: string;
  /** "Try again". Defaults to a full reload, which also re-fetches the page's code. */
  onRetry?: () => void;
}

export function NeedsConnection({ title = NEEDS_CONNECTION_DEFAULT_TITLE, onRetry }: NeedsConnectionProps) {
  useOfflinePageReport({ kind: 'needs-connection' });
  return (
    <div data-testid="needs-connection" className="max-w-md mx-auto px-4 py-16 text-center">
      <WifiOff aria-hidden="true" className="h-6 w-6 mx-auto mb-3 text-slate-400" />
      <h1 className="text-base font-semibold text-slate-900">{title}</h1>
      <p className="mt-1 text-sm text-slate-600">{NEEDS_CONNECTION_LINE}</p>
      <div className="mt-6 flex flex-col items-center gap-3">
        {/* Blue, like every action (design system); a pill outline to match the page's sibling
            secondary control ("Go back"), since Try again is not a primary commit. */}
        <Button
          type="button"
          variant="outline"
          className="h-10 px-5 rounded-full border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
          onClick={onRetry ?? (() => window.location.reload())}
        >
          Try again
        </Button>
        <Link
          to="/"
          className="inline-flex h-10 items-center px-3 text-sm font-medium text-blue-600 hover:underline underline-offset-4"
        >
          Go to home
        </Link>
      </div>
    </div>
  );
}
