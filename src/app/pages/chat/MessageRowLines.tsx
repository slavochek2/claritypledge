/**
 * @file MessageRowLines.tsx
 * @description Lines of a message row: its author and time, where a private ask was made, and the note on a message that failed to send.
 */
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ChatMessage, ChatSummary } from '@/app/data/chat-service';
import type { ChatAuthor } from '@/app/data/chat-ui-helpers';
import { AuthorName, TranscriptionMark } from './MessageParts';
import { chatTitle } from './chat-view-model';
import type { MessageActions } from './MessageRow';
import type { LocalMessage } from './use-conversation';

interface HeaderProps {
  agent: boolean;
  mirrorDisplay: string;
  /** Shown beside the mirror's own name, when it has one. */
  mirrorSubtitle: string | null;
  author: ChatAuthor | undefined;
  authorId: string | null;
  pending: boolean;
  time: string;
  msg: ChatMessage | null;
  continuesTranscription?: boolean;
}

export function MessageHeader({ agent, mirrorDisplay, mirrorSubtitle, author, authorId, pending, time, msg, continuesTranscription }: HeaderProps) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 leading-6">
      {agent ? (
        <span className="flex min-w-0 max-w-full items-baseline text-[15px]" data-testid="mirror-author">
          <span className="min-w-0 truncate font-semibold text-foreground">{mirrorDisplay}</span>
          {mirrorSubtitle && <span className="shrink-0 whitespace-pre text-xs text-muted-foreground"> · {mirrorSubtitle}</span>}
        </span>
      ) : (
        <AuthorName author={author} authorId={authorId} pending={pending} className="min-w-0 max-w-full truncate text-[15px] text-foreground" />
      )}
      {time && <span className="text-xs text-muted-foreground">{time}</span>}
      <TranscriptionMark msg={msg} continues={continuesTranscription} />
    </div>
  );
}

export function PrivateLine({ privateHere, askedIn }: { privateHere: boolean; askedIn: ChatSummary | undefined }) {
  if (!privateHere && !askedIn) return null;
  return (
    <p className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="mirror-private">
      <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
      {privateHere ? 'Private: only you see this' : `Asked privately in ${chatTitle(askedIn as ChatSummary)}`}
    </p>
  );
}

export function SendFailedNote({ local, actions }: { local: LocalMessage; actions: MessageActions }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-red-700" data-testid="send-failed" role="alert">
      <span>{local.error ?? 'Not sent.'}</span>
      <Button variant="ghost" className="min-h-10 text-blue-700 hover:bg-blue-50 hover:text-blue-700" onClick={() => actions.onRetry(local.localId)}>
        Retry
      </Button>
      <Button variant="ghost" className="min-h-10 text-muted-foreground" onClick={() => actions.onDiscard(local.localId)}>
        Discard
      </Button>
    </div>
  );
}
