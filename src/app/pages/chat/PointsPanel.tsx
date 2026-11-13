/**
 * @file PointsPanel.tsx
 * @description P1631: "Points in this chat", the live point cards published into this chat, newest first. Each is the SAME card the chat shows for that
 * point (AttachmentCard). A tap on a card's body closes the panel and reveals the message in the chat (scroll + highlight, ?m=); taps on the card's own
 * controls (position buttons, Details) keep their own meaning. Beside the chat from lg up; the whole screen below it, with Back.
 */
import { useChat } from './chat-state';
import { useChatPoints } from './use-chat-points';
import { AttachmentCard } from './AttachmentCard';
import { InlineError, MessagesSkeleton } from './chat-kit';
import { ThreadHeader } from './ThreadHeader';
import { useChatNavigate } from './chat-hooks';
import { chatPath } from './chat-view-model';

const CONTROL = 'button, a, input, textarea, select, [role="button"], [role="menuitem"]';

export function PointsPanel({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const { userId } = useChat();
  const { status, rows: loaded, retry } = useChatPoints(conversationId, true);
  // newest first (the read comes oldest first)
  const rows = [...loaded].sort((a, b) => (a.createdAt === b.createdAt ? b.messageId.localeCompare(a.messageId) : b.createdAt.localeCompare(a.createdAt)));
  const go = useChatNavigate();
  const reveal = (messageId: string) => go(chatPath(conversationId, { messageId }), 'redirect');
  return (
    <section aria-label="Points in this chat" data-testid="points-panel" className="flex min-h-0 min-w-0 flex-1 flex-col bg-background lg:w-[400px] lg:flex-none lg:border-l xl:w-[440px]">
      <ThreadHeader onClose={onClose}>
        <h2 className="truncate text-[15px] font-semibold text-foreground">Points in this chat</h2>
      </ThreadHeader>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {status === 'loading' && <MessagesSkeleton />}
        {status === 'error' && <InlineError what="the points in this chat" onRetry={retry} />}
        {status === 'ready' && rows.map((r) => (
          <div
            key={r.messageId}
            role="presentation"
            data-testid="points-panel-item"
            className="cursor-pointer"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest(CONTROL)) return;
              reveal(r.messageId);
            }}
          >
            <AttachmentCard kind="point" id={r.pointId} viewerId={userId} conversationId={conversationId} messageId={r.messageId} />
          </div>
        ))}
      </div>
    </section>
  );
}
