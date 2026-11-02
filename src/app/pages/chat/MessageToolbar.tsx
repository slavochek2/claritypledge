/**
 * @file MessageToolbar.tsx
 * @description P1512: the action toolbar of one message (Reply, Forward, Thread, Clarify, ⋯).
 * Floats on a desktop hover, or sits in line under a tapped message. Split out of MessageRow.tsx,
 * unchanged in behaviour: MessageRow decides WHETHER it shows; this decides what it carries.
 */
import { Forward, MessageSquareText, MoreHorizontal, Reply } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/app/data/chat-service';
import { ClarifyButton, ToolButton } from './MessageParts';
import type { MessageActions } from './MessageRow';

interface Props {
  message: ChatMessage;
  selected: boolean;
  noCopy: boolean;
  ownerOnly: boolean;
  mirror: string;
  actions: MessageActions;
  /** The ⋯ button shows only when there is something the toolbar does not carry. */
  hasMore: boolean;
  /** Close the in-line toolbar (a button was used). */
  onDone: () => void;
  /** Open the ⋯ menu at this point. */
  onMore: (at: { x: number; y: number }) => void;
}

const ICON = 'h-[18px] w-[18px]';

export function MessageToolbar({ message, selected, noCopy, ownerOnly, mirror, actions, hasMore, onDone, onMore }: Props) {
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
      <ToolButton label="Reply" onClick={() => { onDone(); actions.onReply(message); }}>
        <Reply className={ICON} aria-hidden="true" />
      </ToolButton>
      {!noCopy && (
        <ToolButton label="Forward" onClick={() => { onDone(); actions.onForward(message); }}>
          <Forward className={ICON} aria-hidden="true" />
        </ToolButton>
      )}
      {!ownerOnly && actions.onThread && !message.threadRootId && (
        <ToolButton label="Thread" onClick={() => { onDone(); actions.onThread?.(message); }}>
          <MessageSquareText className={ICON} aria-hidden="true" />
        </ToolButton>
      )}
      {!noCopy && actions.onClarify && <ClarifyButton mirror={mirror} onClick={() => { onDone(); actions.onClarify?.(message); }} />}
      {hasMore && (
        <ToolButton
          label="More actions"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onMore({ x: r.right - 208, y: r.bottom + 4 });
          }}
        >
          <MoreHorizontal className={ICON} aria-hidden="true" />
        </ToolButton>
      )}
    </div>
  );
}
