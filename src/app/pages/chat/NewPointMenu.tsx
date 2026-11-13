/**
 * @file NewPointMenu.tsx
 * @description P1631: the + beside the paperclip in the composer of a DM, group or event chat (the Mirror keeps its own, CanvasPlusMenu). One item, "New point":
 * it opens a Clarify thread on this chat in the Mirror, with no draft yet; the owner's first words start the first draft.
 */
import { Plus } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ClarifyMenuIcon } from './MessageParts';
import { CREATE_LABEL } from './canvas-thread-copy';
import { FOCUS_RING, HOVER, ROUND } from './chat-kit';
import { NEW_POINT_LABEL } from './clarify-copy';
import { useClarifyChat } from './use-clarify-chat';

export function NewPointMenu({ conversationId }: { conversationId: string }) {
  const clarifyChat = useClarifyChat();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={CREATE_LABEL} title={CREATE_LABEL} data-testid="composer-plus" className={cn(ROUND, 'text-muted-foreground', HOVER, FOCUS_RING)}>
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem className="min-h-10" data-testid="plus-new-point" onSelect={() => clarifyChat(conversationId, { draft: false })}>
          <span className="mr-2 flex h-4 w-4 items-center justify-center"><ClarifyMenuIcon /></span>
          {NEW_POINT_LABEL}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
