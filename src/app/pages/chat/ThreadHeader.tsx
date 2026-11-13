/**
 * @file ThreadHeader.tsx
 * @description P1512: the top of a thread panel: Back on a phone, the panel icon and Close from lg up, and in between
 * whatever names the thread (`children`) and an optional menu. P1536 W8: inside the canvas workspace (`workspace`) there is no Back (the owner's
 * bar has the ← and the Canvas | Thread switch closes the panel below 1280px); the × shows from 1280px for a draft, and at every width for a
 * pending Clone, where it is what cancels.
 */
import type { ReactNode } from 'react';
import { ArrowLeft, PanelRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { FOCUS_RING, HOVER } from './chat-kit';

/** From which width the × shows. */
const CLOSE_SHOWS = { route: 'hidden lg:flex', draft: 'hidden xl:flex', clarify: 'hidden xl:flex', cancel: 'flex' } as const;

export function ThreadHeader({ onClose, menu, workspace, onBackToChat, clarifyPanel = false, children }: {
  onClose: () => void;
  /** P1631 (AC 137): the Clarify Mirror beside its source is full screen below 1280px, so its Back shows up to 1280px and its × (and panel icon) from there. */
  clarifyPanel?: boolean;
  /** P1631: the thread is in the left area beside the Clarify Mirror (from 1280px): "← Chat" at the top left puts the chat back, and there is no × or panel icon. */
  onBackToChat?: () => void;
  /** In the canvas workspace: 'draft' (× from 1280px) or 'cancel' (a pending Clone: × always). Absent: the thread route's own header. */
  workspace?: 'draft' | 'cancel';
  menu?: ReactNode;
  children: ReactNode;
}) {
  return (
    <header className="flex min-h-14 shrink-0 items-center gap-1 border-b px-2 lg:gap-2 lg:px-4">
      {onBackToChat && (
        <Button type="button" variant="ghost" onClick={onBackToChat} aria-label="Back to chat" data-testid="thread-back-chat" className="h-10 shrink-0 gap-1 px-2 text-sm font-medium text-foreground">
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          Chat
        </Button>
      )}
      {!workspace && !onBackToChat && (
        <button type="button" onClick={onClose} aria-label="Back to the conversation" className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-foreground', clarifyPanel ? 'xl:hidden' : 'lg:hidden', HOVER, FOCUS_RING)}>
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      {!onBackToChat && <PanelRight className={cn('hidden h-[18px] w-[18px] shrink-0 text-muted-foreground', workspace || clarifyPanel ? 'xl:block' : 'lg:block')} aria-hidden="true" />}
      <div className="min-w-0 flex-1">{children}</div>
      {menu}
      {!onBackToChat && <button type="button" onClick={onClose} aria-label="Close thread" className={cn('-mr-2 h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground', CLOSE_SHOWS[workspace ?? (clarifyPanel ? 'clarify' : 'route')], HOVER, FOCUS_RING)}>
        <X className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>}
    </header>
  );
}
