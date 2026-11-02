/**
 * @file RepliesLink.tsx
 * @description P1512: "N replies" under a thread's root message, with the first repliers' faces. Absent inside the thread itself, where there are no threads
 * to open, and when nobody has replied. P1536 3c X11: a canvas thread's root shows it like any other, and what it opens depends on what the thread's draft is
 * (an open draft: the workspace, on its Thread tab; a published or discarded one: the chat's own thread panel, in place). A root with no draft the viewer can
 * read shows none, and neither does one whose read failed: a link that goes nowhere is worse than none.
 */
import { useContext, useRef, useState, type MouseEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/app/data/chat-service';
import type { ThreadStats } from '@/app/data/chat-service';
import type { ChatAuthor } from '@/app/data/chat-ui-helpers';
import { FOCUS_RING, HOVER, PersonMark } from './chat-kit';
import { isCanvasThreadRoot } from './canvas-root';
import { rootLinkTarget } from './canvas-root-link';
import { ChatContext } from './chat-state';
import { useCanvasRootSlot } from './use-canvas-root-slot';

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

/** A plain left click: the only one that checks the current state first. Modifier and middle clicks follow the anchor to its known address (a new tab, copy link). */
const isPlainClick = (e: MouseEvent): boolean => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.defaultPrevented;

/**
 * 3c X11: a canvas thread root's link, by what its draft is. It is a real anchor with the address known NOW (opened in a new tab by a modifier click, copied from the menu). Nothing
 * is drawn until the draft is known, and nothing when there is none to resolve. What it knows comes from the chat's one batched read (canvas-root-store), kept fresh by real signals; a
 * plain left click reads the CURRENT state first (short bound, with a spinner and aria-busy meanwhile) and goes where that says: an open draft to the workspace (below 1280px on the
 * Thread tab; `from` is where its back arrow returns), a published or discarded one to the chat's own thread panel.
 */
function CanvasRepliesLink({ server, stat, authors, onThread, viewerId }: { server: ChatMessage; stat: ThreadStats; authors: Record<string, ChatAuthor>; onThread: (m: ChatMessage) => void; viewerId: string }) {
  const chat = useContext(ChatContext);
  const slug = chat?.authors[viewerId]?.slug ?? null;
  const { snap, readNow } = useCanvasRootSlot({ rootId: server.id, viewerId, slug, count: stat.count });
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const tapping = useRef(false);
  const [pending, setPending] = useState(false);
  const target = snap.status === 'ready' ? rootLinkTarget(snap.draft, snap.detail?.slug ?? slug, server) : null;
  if (!target) return null;
  const from = `${pathname}${search}`;
  const tap = async () => {
    if (tapping.current) return;
    tapping.current = true;
    setPending(true);
    try {
      const now = rootLinkTarget(await readNow(), snap.detail?.slug ?? slug, server); // null: gone since it was drawn, and the link goes with the next render
      if (!now) return;
      if (now.workspace) navigate(now.href, { state: { tab: 'thread', from } });
      else onThread(server);
    } finally {
      tapping.current = false;
      setPending(false);
    }
  };
  return (
    <Link
      to={target.href}
      state={target.workspace ? { tab: 'thread', from } : undefined}
      data-testid="replies-link"
      aria-busy={pending}
      onClick={(e) => {
        if (!isPlainClick(e)) return;
        e.preventDefault();
        void tap();
      }}
      className={cn(LINK, pending && 'opacity-70')}
    >
      <LinkBody stat={stat} authors={authors} />
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
    </Link>
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
