/**
 * @file RepliesLink.tsx
 * @description P1512: "N replies" under a thread's root message, with the first repliers' faces. Absent inside the
 * thread itself, where there are no threads to open, and when nobody has replied. P1536: a canvas draft's thread root
 * (a canvas version card) in the mirror's main conversation shows it even with no reply yet, as "Open draft thread", so
 * a new draft's thread reads as a thread and can be found again from the conversation.
 */
import { MessageSquareText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/app/data/chat-service';
import type { ThreadStats } from '@/app/data/chat-service';
import type { ChatAuthor } from '@/app/data/chat-ui-helpers';
import { FOCUS_RING, HOVER, PersonMark } from './chat-kit';
import { OPEN_DRAFT_THREAD_LABEL } from './canvas-thread-copy';

interface Props {
  inThread: boolean;
  server: ChatMessage | null;
  stat: ThreadStats | undefined;
  authors: Record<string, ChatAuthor>;
  onThread: ((m: ChatMessage) => void) | undefined;
}

const LINK = cn('-ml-1 mt-0.5 flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm font-semibold text-blue-700', HOVER, FOCUS_RING);

/** A canvas draft's thread root: the card a draft thread starts with (the server only lets the owner attach it, in their own mirror). */
const isCanvasThreadRoot = (m: ChatMessage): boolean => m.attachmentKind === 'canvas_version' && !m.isDeleted && !m.threadRootId;

export function RepliesLink({ inThread, server, stat, authors, onThread }: Props) {
  if (inThread || !onThread || !server) return null;
  const count = stat?.count ?? 0;
  if (count <= 0) {
    if (!isCanvasThreadRoot(server)) return null;
    return (
      <button type="button" data-testid="replies-link" onClick={() => onThread(server)} className={LINK}>
        <MessageSquareText className="h-4 w-4" aria-hidden="true" />
        {OPEN_DRAFT_THREAD_LABEL}
      </button>
    );
  }
  return (
    <button type="button" data-testid="replies-link" onClick={() => onThread(server)} className={LINK}>
      <span className="flex -space-x-1.5">
        {(stat?.authorIds ?? [])
          .filter((id) => authors[id])
          .slice(0, 3)
          .map((id) => (
            <PersonMark key={id} person={authors[id] as ChatAuthor} size="xs" />
          ))}
      </span>
      {count === 1 ? '1 reply' : `${count} replies`}
    </button>
  );
}
