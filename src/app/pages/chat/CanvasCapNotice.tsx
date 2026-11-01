/**
 * @file CanvasCapNotice.tsx
 * @description §2 "Composer send slot", at the cap (30 used runs): the composer gives way to one sentence. With something to publish it says to
 * Publish; with nothing to publish it adds Start over (the workspace's discard, which returns to the version the draft came from, ready for the next Send).
 */
import type { ReactNode } from 'react';
import { CAP_LINE, CAP_PUBLISH_LINE } from './canvas-thread-copy';

export function CanvasCapNotice({ canPublish, startOver }: { canPublish: boolean; startOver?: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" data-testid="canvas-cap">
      <p className="min-w-0 flex-1 text-sm text-muted-foreground">{canPublish ? CAP_PUBLISH_LINE : CAP_LINE}</p>
      {!canPublish && startOver}
    </div>
  );
}
