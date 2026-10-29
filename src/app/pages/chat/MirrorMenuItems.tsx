/**
 * @file MirrorMenuItems.tsx
 * @description The mirror's own entries in a conversation's More menu: its info panel (P1533) and, while canvas drafting is
 * on, "New canvas" (P1536). Split out of ConversationHeader so the menu grows here, not there.
 */
import { Info, LayoutGrid } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { ChatSummary } from '@/app/data/chat-service';
import { NEW_CANVAS_LABEL } from './canvas-thread-copy';
import type { HeaderActions } from './ConversationHeader';

export function MirrorMenuItems({ chat, actions }: { chat: ChatSummary; actions: HeaderActions }) {
  return (
    <>
      {actions.onMirrorInfo && (
        // P1533: the panel (portrait, Rename, New portrait) is also reachable from the menu, not only by tapping the name.
        <DropdownMenuItem className="min-h-10" onSelect={actions.onMirrorInfo}>
          <Info className="mr-2 h-4 w-4" aria-hidden="true" />
          <span className="min-w-0 truncate">About {chat.title?.trim() || 'your mirror agent'}</span>
        </DropdownMenuItem>
      )}
      {actions.onNewCanvas && (
        <DropdownMenuItem className="min-h-10" onSelect={actions.onNewCanvas} data-testid="new-canvas">
          <LayoutGrid className="mr-2 h-4 w-4" aria-hidden="true" />
          {NEW_CANVAS_LABEL}
        </DropdownMenuItem>
      )}
    </>
  );
}
