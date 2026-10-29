/**
 * @file RepliesLink.tsx
 * @description P1512: "N replies" under a thread's root message, with the first repliers' faces. Absent inside the
 * thread itself, where there are no threads to open, and when nobody has replied.
 */
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/app/data/chat-service';
import type { ThreadStats } from '@/app/data/chat-service';
import type { ChatAuthor } from '@/app/data/chat-ui-helpers';
import { FOCUS_RING, HOVER, PersonMark } from './chat-kit';

interface Props {
  inThread: boolean;
  server: ChatMessage | null;
  stat: ThreadStats | undefined;
  authors: Record<string, ChatAuthor>;
  onThread: ((m: ChatMessage) => void) | undefined;
}

export function RepliesLink({ inThread, server, stat, authors, onThread }: Props) {
  if (inThread || !onThread || !server || !stat || stat.count <= 0) return null;
  return (
    <button
      type="button"
      data-testid="replies-link"
      onClick={() => onThread(server)}
      className={cn('-ml-1 mt-0.5 flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm font-semibold text-blue-700', HOVER, FOCUS_RING)}
    >
      <span className="flex -space-x-1.5">
        {stat.authorIds
          .filter((id) => authors[id])
          .slice(0, 3)
          .map((id) => (
            <PersonMark key={id} person={authors[id] as ChatAuthor} size="xs" />
          ))}
      </span>
      {stat.count === 1 ? '1 reply' : `${stat.count} replies`}
    </button>
  );
}
