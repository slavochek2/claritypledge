/**
 * @file offline-strip.tsx
 * @description P1369 (prototype variant C): the one offline indicator — a thin dark system strip
 * at the very top of the page, above the nav. Replaces the yellow OfflineBanner (P511), which
 * broke the design system and stacked as a second heavy bar under a session bar.
 *
 * It says what the page reported (offline-status-context.tsx):
 *   - "Offline · saved copy from {age}" ("Offline · saved copy" under a minute) when the page rendered cached data;
 *   - "Offline" when the page needs a connection, or the connection is simply down.
 *
 * Layout: in flow and sticky at the top, carrying the iOS status-bar inset itself. The layout
 * moves its fixed nav down by the strip's height while it shows (useOfflineStripShown).
 */
import { WifiOff } from 'lucide-react';
import { useOfflineStripText } from '@/app/contexts/offline-status-context';

export function OfflineStrip() {
  const text = useOfflineStripText();
  if (!text) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-strip"
      className="sticky top-0 z-[60] bg-slate-800 text-white pt-[env(safe-area-inset-top)]"
    >
      <div className="h-7 px-4 flex items-center justify-center gap-1.5 text-xs font-medium">
        <WifiOff aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        <span className="truncate">{text}</span>
      </div>
    </div>
  );
}
