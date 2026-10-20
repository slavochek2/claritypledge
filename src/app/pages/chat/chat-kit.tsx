/**
 * @file chat-kit.tsx
 * @description P1512: the small visual pieces of the chat — avatars, the day divider, the quote bar,
 * the positioned message menu and the loading / error blocks. Gray chrome; blue-600 only for the
 * unread badge, selection and the one primary action per view.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { CalendarDays, Lock, User, type LucideIcon } from 'lucide-react';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { Button } from '@/components/ui/button';
import { cn, getInitials } from '@/lib/utils';
import { useDismiss } from './chat-hooks';
import { chatTitle, mirrorRole } from './chat-view-model';
import type { ChatSummary } from '@/app/data/chat-mappers';

/** Hover tint only where a real pointer exists (a tap must not leave a row stuck lit). */
export const HOVER = '[@media(hover:hover)]:hover:bg-accent';
/** The design system's primary CTA (docs/design-system.md, Button Decision Rules #1): one per screen. */
export const PRIMARY_CLASS = 'min-h-10 rounded-lg bg-blue-600 text-white hover:bg-blue-700';
export const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const SIZE = {
  xs: '!h-5 !w-5 !text-[10px]',
  sm: '!h-8 !w-8 !text-xs',
  md: '!h-9 !w-9 !text-sm',
  list: '!h-12 !w-12 !text-base',
} as const;
export type MarkSize = keyof typeof SIZE;

export interface PersonLike {
  name: string;
  avatarUrl?: string | null;
  avatarColor?: string | null;
  hasPledged?: boolean;
  /** An erased account: a neutral gray avatar with no initials. */
  deleted?: boolean;
  /** A person whose profile could not be read: a neutral gray avatar with initials. */
  unknown?: boolean;
}

const GRAY_DISC = 'inline-flex shrink-0 items-center justify-center rounded-full bg-gray-200 font-semibold text-gray-600';

export function PersonMark({ person, size = 'md', className }: { person: PersonLike; size?: MarkSize; className?: string }) {
  if (person.deleted) {
    return (
      <span aria-hidden="true" className={cn(GRAY_DISC, SIZE[size], className)}>
        <User className="h-1/2 w-1/2" />
      </span>
    );
  }
  if (person.unknown) {
    return (
      <span aria-hidden="true" className={cn(GRAY_DISC, SIZE[size], className)}>
        {getInitials(person.name)}
      </span>
    );
  }
  const pledger = person.hasPledged ?? false;
  return (
    <GravatarAvatar
      name={person.name}
      photoUrl={person.avatarUrl ?? undefined}
      avatarColor={person.avatarColor ?? undefined}
      isPledger={pledger}
      showRing={pledger && (size === 'list' || size === 'md')}
      size="sm"
      className={cn(SIZE[size], className)}
    />
  );
}

/** A group's General channel (lock: members only) or an event's channel (calendar). */
export function ChannelMark({ kind, size = 'list', selected = false, className }: { kind: 'group' | 'event'; size?: 'list' | 'sm'; selected?: boolean; className?: string }) {
  const Icon = kind === 'event' ? CalendarDays : Lock;
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        // On the selected row's light tint a white disc with a hairline keeps the avatar visible.
        selected ? 'bg-white text-gray-700 ring-1 ring-blue-200' : 'bg-gray-100 text-gray-700',
        size === 'list' ? 'h-12 w-12' : 'h-8 w-8',
        className,
      )}
    >
      <Icon className={size === 'list' ? 'h-5 w-5' : 'h-4 w-4'} />
    </span>
  );
}

const MIRROR_SIZE = { xs: 'h-5 w-5', sm: 'h-8 w-8', list: 'h-12 w-12' } as const;

/**
 * Two facing halves with a dashed axis between them: a reflection. Stroke only, so it reads at 20px and
 * takes the colour of its container.
 */
export function MirrorGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" data-testid="mirror-glyph" className={className}>
      <path d="M10 5a7 7 0 0 0 0 14" />
      <path d="M14 5a7 7 0 0 1 0 14" />
      <path d="M12 3.5v17" strokeWidth="1.5" strokeDasharray="1.5 3" />
    </svg>
  );
}

/**
 * The mirror is not its owner: it wears its own mark, a soft blue disc with a reflection glyph, and a dashed ring
 * that says "agent". Never the owner's photo or initials. `imageUrl` is the slot for a generated portrait (a later
 * spec supplies one); when given it replaces the glyph.
 */
export function MirrorMark({ size = 'list', className, imageUrl }: { size?: keyof typeof MIRROR_SIZE; className?: string; imageUrl?: string | null }) {
  return (
    <span aria-hidden="true" className={cn('relative inline-flex shrink-0 rounded-full outline-dashed outline-2 outline-offset-1 outline-blue-300', className)}>
      <span data-testid="mirror-disc" className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-100 text-blue-700', MIRROR_SIZE[size])}>
        {imageUrl ? <img src={imageUrl} alt="" className="h-full w-full object-cover" /> : <MirrorGlyph className="h-[62%] w-[62%]" />}
      </span>
    </span>
  );
}

/**
 * The mirror's name: the custom title (if any) is the part that truncates; "<First>'s mirror" is its own
 * segment that never shrinks, so the role is always readable (also on a phone).
 */
export function MirrorTitle({ chat, className }: { chat: Pick<ChatSummary, 'title' | 'ownerFirstName'>; className?: string }) {
  const role = mirrorRole(chat);
  if (!chat.title) return <span className={cn('block min-w-0 truncate', className)}>{role}</span>;
  return (
    <span className={cn('flex min-w-0', className)}>
      <span className="min-w-0 truncate">{chat.title}</span>
      <span className="shrink-0 whitespace-pre"> · {role}</span>
    </span>
  );
}

/**
 * A chat's name on one line with its role kept: the mirror's role, a channel's "· General" and an event's
 * date are their own segments that never shrink; the name in front of them is what gets the ellipsis.
 */
export function ChatRowTitle({ chat, className, stacked = false }: { chat: ChatSummary; className?: string; /** A renamed mirror: its name on line one, its role on line two. */ stacked?: boolean }) {
  if (chat.kind === 'mirror' && stacked) {
    return (
      <span className={cn('block min-w-0', className)}>
        <span className="block truncate">{chat.title ?? mirrorRole(chat)}</span>
        {chat.title && (
          <span className="block shrink-0 whitespace-nowrap text-xs font-normal text-muted-foreground" data-testid="row-role">
            {mirrorRole(chat)}
          </span>
        )}
      </span>
    );
  }
  if (chat.kind === 'mirror') return <MirrorTitle chat={chat} className={className} />;
  const tail =
    chat.kind === 'group'
      ? ' · General'
      : chat.kind === 'event' && chat.event
        ? ` · ${new Date(chat.event.datetime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : null;
  if (!tail) return <span className={cn('block min-w-0 truncate', className)}>{chatTitle(chat)}</span>;
  const head = chat.kind === 'group' ? chat.org?.name ?? 'Group' : chat.event?.title ?? 'Event';
  return (
    <span className={cn('flex min-w-0', className)}>
      <span className="min-w-0 truncate">{head}</span>
      <span className="shrink-0 whitespace-pre">{tail}</span>
    </span>
  );
}

/** Blue count pill. Hidden at 0. */
export function CountBadge({ n, className, label }: { n: number; className?: string; label?: string }) {
  if (n <= 0) return null;
  return (
    <span
      aria-label={label ?? `${n} unread`}
      className={cn('flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold text-white', className)}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

/** A centred pill on a rule: the day, or "New messages". */
export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="relative my-2 flex justify-center px-4" role="separator">
      <span className="absolute inset-x-0 top-1/2 h-px bg-border" aria-hidden="true" />
      <span className="relative inline-flex max-w-full items-center rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">{children}</span>
    </div>
  );
}

export interface MenuItem {
  key: string;
  label: string;
  Icon: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
}

/**
 * A menu at a screen point: a right-click, a long press, or under the ⋯ button. Escape and an
 * outside press close it; arrow keys move; the first item takes focus.
 */
export function PopMenu({ at, items, label, onClose }: { at: { x: number; y: number }; items: MenuItem[]; label: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // Focus goes back to whatever opened the menu (the ⋯ button, or the message), as a real menu does.
  const opener = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null));
  useDismiss(onClose, true, [ref]);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const back = opener.current;
    return () => {
      if (back && back !== document.body && back.isConnected) back.focus({ preventScroll: true });
    };
  }, []);
  const width = 208;
  const height = items.length * 44 + 8;
  const x = Math.max(8, Math.min(at.x, (typeof window !== 'undefined' ? window.innerWidth : 1024) - width - 8));
  const y = Math.max(8, Math.min(at.y, (typeof window !== 'undefined' ? window.innerHeight : 768) - height - 8));
  const move = (e: React.KeyboardEvent) => {
    const nodes = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = nodes.indexOf(document.activeElement as HTMLElement);
    const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? nodes.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    nodes[(to + nodes.length) % nodes.length]?.focus();
  };
  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      aria-label={label}
      onKeyDown={move}
      style={{ left: x, top: y, width }}
      className="fixed z-50 rounded-xl border bg-popover p-1 text-popover-foreground shadow-xl"
    >
      {items.map(({ key, label: text, Icon, onSelect, danger }) => (
        <button
          key={key}
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            onSelect();
          }}
          className={cn('flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm', HOVER, 'focus-visible:bg-accent focus-visible:outline-none', danger ? 'text-red-700' : 'text-foreground')}
        >
          <Icon className={cn('h-4 w-4 shrink-0', !danger && 'text-muted-foreground')} aria-hidden="true" />
          {text}
        </button>
      ))}
    </div>
  );
}

/** Pulsing rows shaped like the chat list. */
export function ListSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading chats" className="divide-y">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 px-3 py-3">
          <div className="h-12 w-12 shrink-0 rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-1/3 rounded bg-muted" />
            <div className="h-3.5 w-3/4 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Pulsing message rows. */
export function MessagesSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading messages" className="space-y-4 px-4 py-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex animate-pulse gap-3">
          <div className="h-9 w-9 shrink-0 rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-1/4 rounded bg-muted" />
            <div className="h-4 w-4/5 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** What failed, and a Retry that reads again. */
export function InlineError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-sm text-muted-foreground">Could not load {what}. Try again.</p>
      <Button variant="outline" className="min-h-10" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
