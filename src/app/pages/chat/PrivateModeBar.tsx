/**
 * @file PrivateModeBar.tsx
 * @description P1520: the strip at the top of the composer while a private @mirror ask is open. Pure display.
 */
import { Lock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FOCUS_RING, HOVER, ROUND } from './chat-kit';
import type { MentionEntry } from './mention-picker';

export function PrivateModeBar({ entry, onLeave }: { entry: MentionEntry; onLeave: () => void }) {
  return (
    <div className="flex min-h-10 items-center gap-2 px-2 pt-0.5" data-testid="private-mode">
      {entry.mark}
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="font-semibold text-foreground">{entry.label}</span>
        <span className="text-muted-foreground"> · </span>
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Lock className="h-3 w-3" aria-hidden="true" />
          Private: only you see this
        </span>
      </span>
      <button type="button" aria-label="Stop asking privately" title="Stop asking privately" onClick={onLeave} className={cn(ROUND, 'text-muted-foreground', HOVER, FOCUS_RING)}>
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
