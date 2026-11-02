/**
 * @file RepliesLink.tsx
 * @description P1512: "N replies" under a thread's root message, with the first repliers' faces. Absent inside the thread itself, where there are no threads
 * to open, and when nobody has replied. P1536 3c X11: a canvas thread's root shows it like any other, and what it opens depends on what the thread's draft is
 * (an open draft: the workspace, on its Thread tab; a published or discarded one: the chat's own thread panel, in place). A root with no draft the viewer can
 * read shows none, and neither does one whose read failed: a link that goes nowhere is worse than none.
 */
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/app/data/chat-service';
import type { ThreadStats } from '@/app/data/chat-service';
import type { ChatAuthor } from '@/app/data/chat-ui-helpers';
import { FOCUS_RING, HOVER, PersonMark } from './chat-kit';
import { isCanvasThreadRoot } from './canvas-root';
import { useCanvasRootCard } from './use-canvas-root-card';

interface Props {
  inThread: boolean;
  server: ChatMessage | null;
  stat: ThreadStats | undefined;
  authors: Record<string, ChatAuthor>;
  onThread: ((m: ChatMessage) => void) | undefined;
  viewerId: string;
}

const LINK = cn('-ml-1 mt-0.5 flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm font-semibold text-blue-700', HOVER, FOCUS_RING);

/** The faces and the count, the same for every thread's link. */
function LinkBody({ stat, authors }: { stat: ThreadStats; authors: Record<string, ChatAuthor> }) {
  const count = stat.count;
  return (
    <>
      <span className="flex -space-x-1.5">
        {stat.authorIds
          .filter((id) => authors[id])
          .slice(0, 3)
          .map((id) => (
            <PersonMark key={id} person={authors[id] as ChatAuthor} size="xs" />
          ))}
      </span>
      {count === 1 ? '1 reply' : `${count} replies`}
    </>
  );
}

/** 3c X11: a canvas thread root's link, by what its draft is. Nothing until the draft is known, and nothing when there is none to resolve. */
function CanvasRepliesLink({ server, stat, authors, onThread, viewerId }: { server: ChatMessage; stat: ThreadStats; authors: Record<string, ChatAuthor>; onThread: (m: ChatMessage) => void; viewerId: string }) {
  const card = useCanvasRootCard(server.id, server.attachmentId, viewerId);
  const { pathname, search } = useLocation();
  if (!card?.hasThread) return null;
  // An open draft is edited in the workspace: its thread is the panel there. Below 1280px it opens on the Thread tab; `from` is where its back arrow returns.
  if (card.state === 'draft' && card.openHref) {
    return (
      <Link to={card.openHref} state={{ tab: 'thread', from: `${pathname}${search}` }} data-testid="replies-link" className={LINK}>
        <LinkBody stat={stat} authors={authors} />
      </Link>
    );
  }
  if (card.state === 'draft') return null; // an open draft whose address cannot be read has nowhere to go
  return (
    <button type="button" data-testid="replies-link" onClick={() => onThread(server)} className={LINK}>
      <LinkBody stat={stat} authors={authors} />
    </button>
  );
}

export function RepliesLink({ inThread, server, stat, authors, onThread, viewerId }: Props) {
  if (inThread || !onThread || !server) return null;
  if (!stat || stat.count <= 0) return null;
  if (isCanvasThreadRoot(server)) return <CanvasRepliesLink server={server} stat={stat} authors={authors} onThread={onThread} viewerId={viewerId} />;
  return (
    <button type="button" data-testid="replies-link" onClick={() => onThread(server)} className={LINK}>
      <LinkBody stat={stat} authors={authors} />
    </button>
  );
}
