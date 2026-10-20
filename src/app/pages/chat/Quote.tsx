/**
 * @file Quote.tsx
 * @description P1512: the one quote block that reply, forward and clarify share, in the composer while a reply is
 * pending (with ×) and in the sent message. A header label, a quoted body, and anything quoted inside (a
 * compact point or story card). Pressing the block goes to the original; without an original to go to it is
 * plain text, never a dead control.
 */
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FOCUS_RING, HOVER } from './chat-kit';

interface Props {
  testId: string;
  label: ReactNode;
  /** Plain-text name of what is quoted (who and what), so the jump button is announced with its content. */
  summary?: string;
  /** The quoted words. */
  body?: ReactNode;
  /** Whatever else was quoted (a thread, an attached card). Not interactive. */
  children?: ReactNode;
  /** Present only when there is an original to go to. */
  onJump?: () => void;
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
}

export function Quote({ testId, label, summary, body, children, onJump, onRemove, removeLabel = 'Remove', className }: Props) {
  const shell = 'block w-full rounded-xl border bg-muted/40 p-3 text-left';
  const inner = (
    <>
      <span className={cn('block text-xs font-medium text-muted-foreground', onRemove && 'pr-10')} data-testid="forwarded-label">
        {label}
      </span>
      {body}
      {children}
    </>
  );
  return (
    <div className={cn('relative mt-1 w-full max-w-md', className)}>
      {onJump ? (
        <button type="button" data-testid={testId} aria-label={summary ? `Go to original message: ${summary}` : 'Go to original message'} onClick={onJump} className={cn(shell, HOVER, FOCUS_RING)}>
          {inner}
        </button>
      ) : (
        <div data-testid={testId} className={shell}>
          {inner}
        </div>
      )}
      {onRemove && (
        <button type="button" aria-label={removeLabel} onClick={onRemove} className={cn('absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground', HOVER, FOCUS_RING)}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
