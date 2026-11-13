/**
 * @file use-clarify-layout.ts
 * @description P1631 (AC 137): how a thread panel lays itself out when it is (or may be) the Mirror's Clarify thread, moved out of ThreadPanel.
 * Every Clarify thread outside the canvas workspace and the left area is full screen below 1280px; a Mirror-chat thread whose root is still being read
 * is laid out as one until known (the page does the same), so a Clarify thread never flashes the side layout. A Clarify thread is tinted below 1280px,
 * on the panel and on its message list. The page is told whether the thread is a Clarify thread: null while the root is being read, then true or false.
 */
import { useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { ChatSummary } from '@/app/data/chat-service';
import { CLARIFY_NARROW_TINT } from './clarify-panel';

interface ClarifyLayoutInput {
  summary: Pick<ChatSummary, 'kind'>;
  /** The thread's read state: 'loading' until its root is read. */
  status: string;
  isClarify: boolean;
  clarifyPanel: boolean;
  fill: boolean;
  /** Present when the thread fills the left area beside the Mirror. */
  leftArea: boolean;
  onClarifyThread?: (isClarify: boolean | null) => void;
}

export function useClarifyLayout({ summary, status, isClarify, clarifyPanel, fill, leftArea, onClarifyThread }: ClarifyLayoutInput) {
  const clarifyKnown = status !== 'loading';
  useEffect(() => { onClarifyThread?.(clarifyKnown ? isClarify : null); }, [clarifyKnown, isClarify, onClarifyThread]);
  const asClarify = !fill && !leftArea && (clarifyPanel || isClarify || (summary.kind === 'mirror' && !clarifyKnown));
  const tinted = isClarify && !fill;
  const sidePanel = fill || leftArea ? null : asClarify ? 'xl:w-[440px] xl:flex-none xl:border-l' : 'lg:w-[400px] lg:flex-none lg:border-l xl:w-[440px]';
  return {
    asClarify,
    panelClass: cn('flex min-h-0 min-w-0 flex-1 flex-col bg-background', sidePanel, tinted && CLARIFY_NARROW_TINT),
    scrollerClassName: tinted ? CLARIFY_NARROW_TINT : undefined,
  };
}
