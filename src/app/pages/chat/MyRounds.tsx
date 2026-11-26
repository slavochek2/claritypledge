/**
 * @file MyRounds.tsx
 * @description P1592 D4: the conversation's header with the viewer's round threads in its three-dot menu
 * (event channels only). The threads are read here, once, whether or not the menu is open, so the menu
 * never shows a list that is still on its way. The menu itself is MyRoundsMenu.tsx.
 * P1631: the same header carries "Points in this chat (N)" (every chat but the Mirror), which opens the points panel beside the chat.
 */
import { useLocation, useNavigate } from 'react-router-dom';
import { ConversationHeader, type HeaderActions } from './ConversationHeader';
import type { ChatSummary } from '@/app/data/chat-service';
import { useChatNavigate } from './chat-hooks';
import { chatPath } from './chat-view-model';
import { ChatTranscribe } from './ChatTranscribe';
import { useMyRoundThreads } from './use-my-round-threads';
import { useChatPoints } from './use-chat-points';
import { pointsPanelPushed, pointsPushState, withPointsPanel } from './points-panel';

export function ConversationTop({ summary, blocked, actions, cameFromElsewhere }: { summary: ChatSummary; blocked: boolean; actions: HeaderActions; cameFromElsewhere?: boolean }) {
  const threads = useMyRoundThreads(summary.conversationId, summary.kind === 'event');
  const points = useChatPoints(summary.conversationId, summary.kind !== 'mirror');
  const go = useChatNavigate();
  const navigate = useNavigate();
  const here = useLocation();
  const openPoints = () => {
    const already = pointsPanelPushed(here.state);
    navigate({ pathname: here.pathname, search: withPointsPanel(here.search) }, already ? { replace: true, state: here.state } : { state: pointsPushState(here.state) });
  };
  return (
    <ChatTranscribe chat={summary}>
      {(onTranscribe, transcribeBusy) => (
        <ConversationHeader
          chat={summary}
          blocked={blocked}
          actions={actions}
          cameFromElsewhere={cameFromElsewhere}
          rounds={summary.kind === 'event' ? threads : undefined}
          onOpenRound={(rootId) => go(chatPath(summary.conversationId, { rootId }))}
          onTranscribe={onTranscribe}
          transcribeBusy={transcribeBusy}
          pointsCount={points.status === 'ready' ? points.rows.length : null}
          onOpenPoints={openPoints}
        />
      )}
    </ChatTranscribe>
  );
}
