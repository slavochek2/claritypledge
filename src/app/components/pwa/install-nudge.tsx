/**
 * @file install-nudge.tsx
 * @description P1593: the one unprompted install offer. A strip in the mobile bottom bar's
 * "Today's event" slot, shown from the 2nd visit on. The bar renders it only when there is no
 * today's-event strip (one primary per view, P1433 D2). Two sibling buttons, never nested.
 */
import { SmartphoneIcon, XIcon } from 'lucide-react';
import { usePwaInstall } from '@/hooks/use-pwa-install';

export function InstallNudge() {
  const { openInstall, dismiss } = usePwaInstall();
  return (
    <div
      data-testid="install-nudge"
      className="flex h-10 items-stretch border-b border-blue-200 bg-blue-50 text-sm font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200"
    >
      <button
        type="button"
        onClick={() => { void openInstall('return_nudge'); }}
        className="flex min-w-0 flex-1 items-center justify-center gap-2 px-2 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:hover:bg-blue-900"
      >
        <SmartphoneIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">Add Clarity Pledge to your home screen</span>
      </button>
      <button
        type="button"
        onClick={() => dismiss('return_nudge')}
        aria-label="Dismiss"
        className="flex h-10 w-10 shrink-0 items-center justify-center transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring dark:hover:bg-blue-900"
      >
        <XIcon className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
