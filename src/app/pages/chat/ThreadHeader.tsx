/**
 * @file ThreadHeader.tsx
 * @description P1512: the top of a thread panel: Back on a phone, the panel icon and Close from lg up, and in between
 * whatever names the thread (`children`) and an optional menu.
 */
import type { ReactNode } from 'react';
import { ArrowLeft, PanelRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FOCUS_RING, HOVER } from './chat-kit';

export function ThreadHeader({ onClose, menu, children }: {
  onClose: () => void;
  menu?: ReactNode;
  children: ReactNode;
}) {
  return (
    <header className="flex min-h-14 shrink-0 items-center gap-1 border-b px-2 lg:gap-2 lg:px-4">
      <button type="button" onClick={onClose} aria-label="Back to the conversation" className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-foreground lg:hidden', HOVER, FOCUS_RING)}>
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <PanelRight className="hidden h-[18px] w-[18px] shrink-0 text-muted-foreground lg:block" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
      {menu}
      <button type="button" onClick={onClose} aria-label="Close thread" className={cn('-mr-2 hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground lg:flex', HOVER, FOCUS_RING)}>
        <X className="h-[18px] w-[18px]" aria-hidden="true" />
      </button>
    </header>
  );
}
