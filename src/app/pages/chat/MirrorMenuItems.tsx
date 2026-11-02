/**
 * @file MirrorMenuItems.tsx
 * @description The mirror's own entries in a conversation's More menu: its info panel (P1533). Split out of ConversationHeader so the menu grows
 * here, not there. (3c X3: "New canvas" left this menu; creating a canvas is the + on the composer, CanvasPlusMenu.)
 */
import { Info } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { ChatSummary } from '@/app/data/chat-service';
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
    </>
  );
}
