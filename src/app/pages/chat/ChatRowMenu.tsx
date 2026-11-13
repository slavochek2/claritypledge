/**
 * @file ChatRowMenu.tsx
 * @description The "..." actions menu of one chat-list row: Clarify, Archive, Mark as read / unread.
 */
import { MoreHorizontal, CircleDot, CheckCheck } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { isChatUnread, type ChatSummary } from '@/app/data/chat-service';
import { ArchiveMenuItem } from './ArchiveMenuItem';
import { ClarifyMenuIcon } from './MessageParts';
import { useClarifyAvailable } from './use-clarify-availability';
import { CLARIFY_LABEL } from './clarify-copy';
import { FOCUS_RING } from './chat-kit';
import { useLeaveChat } from './chat-hooks';
import { useChat } from './chat-state';

interface Props {
  chat: ChatSummary;
  active: boolean;
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClarify: (conversationId: string) => void;
}

export function ChatRowMenu({ chat, active, title, open, onOpenChange, onClarify }: Props) {
  const { setArchived, setManualUnread, markRead } = useChat();
  const leave = useLeaveChat();
  const clarifyOn = useClarifyAvailable(chat);
  const unread = isChatUnread(chat);

  const leaveIfOpen = () => {
    if (active) leave();
  };

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${title}`}
          className={cn(
            'absolute right-1 top-1 flex h-10 w-10 items-center justify-center rounded-full opacity-0 transition-opacity',
            'focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:none)]:opacity-100',
            active ? 'text-gray-700 hover:bg-blue-100' : 'text-muted-foreground hover:bg-accent',
            FOCUS_RING,
          )}
        >
          <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {clarifyOn && (
          <DropdownMenuItem className="min-h-10" data-testid="row-clarify" onSelect={() => onClarify(chat.conversationId)}>
            <span className="mr-2 flex h-4 w-4 items-center justify-center"><ClarifyMenuIcon /></span>
            {CLARIFY_LABEL}
          </DropdownMenuItem>
        )}
        <ArchiveMenuItem
          chat={chat}
          onSelect={() => {
            if (!chat.archived) leaveIfOpen();
            void setArchived(chat.conversationId, !chat.archived);
          }}
        />
        {unread ? (
          <DropdownMenuItem className="min-h-10" onSelect={() => void markRead(chat.conversationId, chat.lastMessage?.id)}>
            <CheckCheck className="mr-2 h-4 w-4" aria-hidden="true" />
            Mark as read
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            className="min-h-10"
            onSelect={() => {
              leaveIfOpen();
              void setManualUnread(chat.conversationId, true);
            }}
          >
            <CircleDot className="mr-2 h-4 w-4" aria-hidden="true" />
            Mark as unread
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
