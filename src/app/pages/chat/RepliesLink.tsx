/**
 * @file RepliesLink.tsx
 * @description P1512: "N replies" under a thread's root message, with the first repliers' faces. Absent inside the thread itself, where there are no threads
 * to open, and when nobody has replied. P1536 3c X11: a canvas thread's root shows it like any other, and what it opens depends on what the thread's draft is
 * (an open draft: the workspace, on its Thread tab; a published or discarded one: the chat's own thread panel, in place). A root with no draft the viewer can
 * read shows none, and neither does one whose read failed: a link that goes nowhere is worse than none.
 */
import { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/app/data/chat-service';
import type { ThreadStats } from '@/app/data/chat-service';
import type { ChatAuthor } from '@/app/data/chat-ui-helpers';
import { FOCUS_RING, HOVER, PersonMark } from './chat-kit';
import { isCanvasThreadRoot } from './canvas-root';
import { useCanvasRootThread } from './use-canvas-root-thread';

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

/**
 * 3c X11: a canvas thread root's link, by what its draft is. Nothing until the draft is known, and nothing when there is none to resolve. What it draws is kept
 * fresh by real signals (a reply arriving, the tab returning, the same-tab event), and the TAP reads the current state itself, so a stale link never lands wrong:
 * an open draft is edited in the workspace (its thread is the panel there; below 1280px it opens on the Thread tab, and `from` is where its back arrow returns),
 * a published or discarded one is read in the chat's own thread panel.
 */
function CanvasRepliesLink({ server, stat, authors, onThread, viewerId }: { server: ChatMessage; stat: ThreadStats; authors: Record<string, ChatAuthor>; onThread: (m: ChatMessage) => void; viewerId: string }) {
  const { thread, resolveNow } = useCanvasRootThread(server.id, viewerId, stat.count);
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const tapping = useRef(false);
  if (!thread || (thread.state === 'open' && !thread.openHref)) return null; // an open draft whose address cannot be read has nowhere to go
  const tap = async () => {
    if (tapping.current) return;
    tapping.current = true;
    try {
      const now = await resolveNow();
      if (!now) return; // gone since it was drawn: there is nothing to open, and the link follows
      if (now.state === 'open' && now.openHref) navigate(now.openHref, { state: { tab: 'thread', from: `${pathname}${search}` } });
      else if (now.state !== 'open') onThread(server);
    } finally {
      tapping.current = false;
    }
  };
  return (
    <button type="button" data-testid="replies-link" onClick={() => void tap()} className={LINK}>
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
