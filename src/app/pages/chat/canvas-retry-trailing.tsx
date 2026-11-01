/**
 * P1536: the "Try again" a failed newest run puts under the owner message it belongs to (or nothing). Split from use-canvas-parts so that
 * file stays a list of pieces; the target message is retry-target's pure rule.
 */
import type { ReactNode } from 'react';
import type { ChatMessage } from '@/app/data/chat-service';
import { CanvasRetry } from './CanvasRetry';
import { retryTargetId } from './canvas-retry-target';
import type { CanvasThread } from './use-canvas-thread';

export function canvasRetryTrailing(live: CanvasThread | null, args: { messages: ChatMessage[]; userId: string; rootId: string }): { afterId: string; node: ReactNode } | null {
  if (!live || live.draft.state !== 'open' || live.run?.state !== 'failed') return null;
  const afterId = retryTargetId(args.messages, args.userId, args.rootId);
  return afterId ? { afterId, node: <CanvasRetry draft={live.draft} run={live.run} reload={live.reload} /> } : null;
}
