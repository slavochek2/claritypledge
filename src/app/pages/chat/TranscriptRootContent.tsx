/**
 * @file TranscriptRootContent.tsx
 * @description P1624: a transcription session's root in the message list. An icon, "Transcript", its muted date and "Open transcript",
 * all one target that opens the thread. People's replies show under it; the transcript text in the thread is never counted here.
 */
import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage, ThreadStats } from '@/app/data/chat-service';
import type { ChatAuthor } from '@/app/data/chat-ui-helpers';
import { sessionRootMeta, type SessionRoot } from '@/app/data/session-thread-title';
import { ARTIFACT_DISC } from './artifact-card-style';
import { FOCUS_RING, HOVER } from './chat-kit';
import { RepliesLink } from './RepliesLink';

interface Props {
  root: SessionRoot;
  server: ChatMessage;
  stat: ThreadStats | undefined;
  authors: Record<string, ChatAuthor>;
  viewerId: string;
  onThread: (m: ChatMessage) => void;
  onOpen: () => void;
}

export function TranscriptRootContent({ root, server, stat, authors, viewerId, onThread, onOpen }: Props) {
  const people: ThreadStats | undefined = stat && { count: stat.peopleCount ?? 0, authorIds: stat.peopleAuthorIds ?? [] };
  return (
    <>
      <button type="button" data-testid="transcript-open" onClick={onOpen} className={cn('-ml-1 flex min-h-11 w-full gap-2.5 rounded-lg px-1 text-left', HOVER, FOCUS_RING)}>
        <span className={ARTIFACT_DISC} aria-hidden="true"><FileText className="h-[18px] w-[18px]" /></span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-1.5 leading-6">
            <span className="text-[15px] font-semibold text-foreground">Transcript</span>
            <span data-testid="transcript-meta" className="text-xs text-muted-foreground">{sessionRootMeta(root)}</span>
          </span>
          <span className="block text-sm font-semibold text-blue-700">Open transcript</span>
        </span>
      </button>
      <div className="pl-[46px]">
        <RepliesLink inThread={false} server={server} stat={people} authors={authors} onThread={onThread} viewerId={viewerId} />
      </div>
    </>
  );
}
