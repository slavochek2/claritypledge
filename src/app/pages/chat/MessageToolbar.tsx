/**
 * @file MessageToolbar.tsx
 * @description The action bar of one message: Clarify (where it is offered) and ⋯, nothing else. ⋯ opens the message's one menu (message-menu-items.ts), the same list a
 * right-click or a long press opens. Floats on a desktop hover, or sits in line under a tapped message. MessageRow decides WHETHER it shows; this decides what it carries.
 */
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/app/data/chat-service';
import { ClarifyButton, ToolButton } from './MessageParts';
import type { MessageActions } from './MessageRow';
import { menuWidth } from './menu-width';

interface Props {
  message: ChatMessage;
  selected: boolean;
  mirror: string;
  actions: MessageActions;
  /** The ⋯ button shows when the message has a menu. */
  hasMenu: boolean;
  /** Whether this message offers Clarify (its menu has the item; the Mirror decides per message, P1722). */
  clarifiable: boolean;
  /** The menu carries the reactions strip (it is wider): where the dots anchor it depends on that. */
  hasReactions: boolean;
  /** Close the in-line toolbar (a button was used). */
  onDone: () => void;
  /** Open the menu at this point. */
  onMore: (at: { x: number; y: number }) => void;
}

const ICON = 'h-[18px] w-[18px]';

export function MessageToolbar({ message, selected, clarifiable, mirror, actions, hasMenu, hasReactions, onDone, onMore }: Props) {
  return (
    <div
      role="toolbar"
      aria-label="Message actions"
      className={cn(
        'flex items-center gap-0.5 rounded-2xl border bg-background p-0.5 shadow',
        selected
          ? 'mt-1.5 inline-flex max-w-full flex-nowrap'
          : 'pointer-events-none absolute -top-5 right-3 z-10 opacity-0 transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 lg:[@media(hover:hover)]:group-hover:pointer-events-auto lg:[@media(hover:hover)]:group-hover:opacity-100',
      )}
    >
      {clarifiable && actions.onClarify && <ClarifyButton mirror={mirror} onClick={() => { onDone(); actions.onClarify?.(message); }} />}
      {hasMenu && (
        <ToolButton
          label="More actions"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onMore({ x: r.right - menuWidth(hasReactions), y: r.bottom + 4 });
          }}
        >
          <MoreHorizontal className={ICON} aria-hidden="true" />
        </ToolButton>
      )}
    </div>
  );
}
