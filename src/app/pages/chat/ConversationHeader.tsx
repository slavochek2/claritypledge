/**
 * @file ConversationHeader.tsx
 * @description P1512: the top of a conversation. What it shows and links to depends on the kind:
 * a 1:1 names the person (link to their live profile) and marks a Clarity Partner; a group names
 * the organisation + General (link to the live group page); an event names itself with its date
 * (link to the live event page); the mirror always says whose mirror it is, also on a phone.
 */
import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, ArrowLeft, Ban, CircleDot, ExternalLink, MoreHorizontal, Pencil, UserRound } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import type { ChatSummary } from '@/app/data/chat-service';
import { cn } from '@/lib/utils';
import { ChannelMark, FOCUS_RING, HOVER, MirrorMark, PersonMark, type PersonLike } from './chat-kit';
import { mirrorLabel } from './chat-view-model';

export interface HeaderActions {
  onBack: () => void;
  onArchive: () => void;
  onMarkUnread: () => void;
  onBlock: () => void;
  onUnblock: () => void;
  onRename: () => void;
}

const NAME = 'block break-words text-[15px] font-semibold leading-tight text-foreground line-clamp-2 sm:text-base sm:leading-normal sm:line-clamp-1';
const SUB = 'block truncate text-xs text-muted-foreground';
const TITLE_BOX = 'flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg';

function eventWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function Title({ chat, owner }: { chat: ChatSummary; owner: PersonLike }) {
  switch (chat.kind) {
    case 'dm': {
      const other = chat.other;
      const body = (
        <>
          <PersonMark person={other ?? { name: 'Deleted user' }} size="sm" className="hidden sm:inline-flex" />
          <span className="min-w-0">
            <h1 className={NAME}>{other?.name ?? 'Deleted user'}</h1>
            {chat.isPartner && <span className={SUB}>Clarity Partner</span>}
          </span>
        </>
      );
      return other?.slug ? (
        <Link to={`/p/${other.slug}`} className={cn(TITLE_BOX, FOCUS_RING)}>
          {body}
        </Link>
      ) : (
        <div className={TITLE_BOX}>{body}</div>
      );
    }
    case 'group': {
      const body = (
        <>
          <ChannelMark kind="group" size="sm" className="hidden sm:flex" />
          <span className="min-w-0">
            <h1 className={NAME}>{chat.org?.name ?? 'Group'}</h1>
            <span className={SUB}>General</span>
          </span>
        </>
      );
      return chat.org ? (
        <Link to={`/groups/${chat.org.slug}`} className={cn(TITLE_BOX, FOCUS_RING)}>
          {body}
        </Link>
      ) : (
        <div className={TITLE_BOX}>{body}</div>
      );
    }
    case 'event': {
      const body = (
        <>
          <ChannelMark kind="event" size="sm" className="hidden sm:flex" />
          <span className="min-w-0">
            <h1 className={NAME}>{chat.event?.title ?? 'Event'}</h1>
            {chat.event && <span className={SUB}>{eventWhen(chat.event.datetime)}</span>}
          </span>
        </>
      );
      return chat.event ? (
        <Link to={`/events/${chat.event.slug}`} className={cn(TITLE_BOX, FOCUS_RING)}>
          {body}
        </Link>
      ) : (
        <div className={TITLE_BOX}>{body}</div>
      );
    }
    case 'mirror':
      return (
        <div className={TITLE_BOX}>
          <MirrorMark owner={owner} size="sm" className="hidden sm:inline-flex" />
          {/* The role is part of the name and is never the part that gets cut. */}
          <h1 className={NAME}>{mirrorLabel(chat)}</h1>
        </div>
      );
  }
}

export function ConversationHeader({ chat, owner, blocked, actions }: { chat: ChatSummary; owner: PersonLike; blocked: boolean; actions: HeaderActions }) {
  const other = chat.other;
  const canBlock = chat.kind === 'dm' && !!other?.id;
  return (
    <header className="flex min-h-14 shrink-0 items-center gap-1 border-b px-2 lg:px-4">
      <button
        type="button"
        aria-label="Back to chats"
        onClick={actions.onBack}
        className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full lg:hidden', HOVER, FOCUS_RING)}
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">
        <Title chat={chat} owner={owner} />
      </div>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="More" className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground', HOVER, FOCUS_RING)}>
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {chat.kind === 'dm' && other?.slug && (
            <DropdownMenuItem asChild className="min-h-10">
              <Link to={`/p/${other.slug}`}>
                <UserRound className="mr-2 h-4 w-4" aria-hidden="true" />
                View profile
              </Link>
            </DropdownMenuItem>
          )}
          {chat.kind === 'group' && chat.org && (
            <DropdownMenuItem asChild className="min-h-10">
              <Link to={`/groups/${chat.org.slug}`}>
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                Group page
              </Link>
            </DropdownMenuItem>
          )}
          {chat.kind === 'event' && chat.event && (
            <DropdownMenuItem asChild className="min-h-10">
              <Link to={`/events/${chat.event.slug}`}>
                <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
                Event page
              </Link>
            </DropdownMenuItem>
          )}
          {chat.kind === 'mirror' && (
            <DropdownMenuItem className="min-h-10" onSelect={actions.onRename}>
              <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
              Rename
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="min-h-10" onSelect={actions.onArchive}>
            {chat.archived ? <ArchiveRestore className="mr-2 h-4 w-4" aria-hidden="true" /> : <Archive className="mr-2 h-4 w-4" aria-hidden="true" />}
            {chat.archived ? 'Unarchive' : 'Archive'}
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-10" onSelect={actions.onMarkUnread}>
            <CircleDot className="mr-2 h-4 w-4" aria-hidden="true" />
            Mark as unread
          </DropdownMenuItem>
          {canBlock && (
            <>
              <DropdownMenuSeparator />
              {blocked ? (
                <DropdownMenuItem className="min-h-10" onSelect={actions.onUnblock}>
                  <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
                  Unblock
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="min-h-10 text-red-700 focus:text-red-700" onSelect={actions.onBlock}>
                  <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
                  Block
                </DropdownMenuItem>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
