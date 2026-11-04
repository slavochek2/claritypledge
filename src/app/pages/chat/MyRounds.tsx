/**
 * @file MyRounds.tsx
 * @description P1592 D4: the conversation's header with the viewer's round threads in its three-dot menu
 * (event channels only). The threads are read here, once, whether or not the menu is open, so the menu
 * never shows a list that is still on its way. The menu itself is MyRoundsMenu.tsx.
 */
import { ConversationHeader, type HeaderActions } from './ConversationHeader';
import type { ChatSummary } from '@/app/data/chat-service';
import { useChatNavigate } from './chat-hooks';
import { chatPath } from './chat-view-model';
import { ChatTranscribe } from './ChatTranscribe';
import { useMyRoundThreads } from './use-my-round-threads';

export function ConversationTop({ summary, blocked, actions, cameFromElsewhere }: { summary: ChatSummary; blocked: boolean; actions: HeaderActions; cameFromElsewhere?: boolean }) {
  const threads = useMyRoundThreads(summary.conversationId, summary.kind === 'event');
  const go = useChatNavigate();
  return (
    <ChatTranscribe chat={summary}>
      {(onTranscribe) => (
        <ConversationHeader
          chat={summary}
          blocked={blocked}
          actions={actions}
          cameFromElsewhere={cameFromElsewhere}
          rounds={summary.kind === 'event' ? threads : undefined}
          onOpenRound={(rootId) => go(chatPath(summary.conversationId, { rootId }))}
          onTranscribe={onTranscribe}
        />
      )}
    </ChatTranscribe>
  );
}
