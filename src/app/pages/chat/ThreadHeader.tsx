/**
 * @file ThreadHeader.tsx
 * @description P1512: the top of a thread panel: Back on a phone, the panel icon and Close from lg up, and in between
 * whatever names the thread (`children`) and an optional menu. P1536 W8: inside the canvas workspace (`workspace`) there is no Back (the owner's
 * bar has the ← and the Canvas | Thread switch closes the panel below 1280px); the × shows from 1280px for a draft, and at every width for a
 * pending Clone, where it is what cancels.
 */
import type { ReactNode } from 'react';
import { ArrowLeft, PanelRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FOCUS_RING, HOVER } from './chat-kit';

/** From which width the × shows. */
const CLOSE_SHOWS = { route: 'hidden lg:flex', draft: 'hidden xl:flex', cancel: 'flex' } as const;

export function ThreadHeader({ onClose, menu, workspace, children }: {
  onClose: () => void;
  /** In the canvas workspace: 'draft' (× from 1280px) or 'cancel' (a pending Clone: × always). Absent: the thread route's own header. */
  workspace?: 'draft' | 'cancel';
  menu?: ReactNode;
  children: ReactNode;
}) {
  return (
    <header className="flex min-h-14 shrink-0 items-center gap-1 border-b px-2 lg:gap-2 lg:px-4">
      {!workspace && (
        <button type="button" onClick={onClose} aria-label="Back to the conversation" className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-foreground lg:hidden', HOVER, FOCUS_RING)}>
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
      <PanelRight className={cn('hidden h-[18px] w-[18px] shrink-0 text-muted-foreground', workspace ? 'xl:block' : 'lg:block')} aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
      {menu}
      <button type="button" onClick={onClose} aria-label="Close thread" className={cn('-mr-2 h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground', CLOSE_SHOWS[workspace ?? 'route'], HOVER, FOCUS_RING)}>
        <X className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>
    </header>
  );
}
