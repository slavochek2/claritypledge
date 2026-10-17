/**
 * @file kit.tsx
 * @description P1509 v15 message primitives (v14's, plus the mirror agent's avatar and a message row that can be
 * said by the mirror, and v11's labelled Clarify tool button). v14 message primitives, ported from v11 (P1503 `conversation-groups/ui.tsx` and
 * `v11/frame/chat.tsx`, which live on an unshipped branch): the hover tip, the production avatar, the
 * Slack-anatomy message row with its hover toolbar (a tap on a phone), the day divider, the thread side
 * panel, the reply quote bar and the rounded composer. Trimmed to what v14 uses: no agent, no mentions.
 * The mic records a mock voice note (v11's dictation hook is not on main, so nothing is transcribed).
 * v14: `useDismiss` (every popover/menu closes on outside click and Esc), a right-click hook on the message row,
 * and a composer field that grows to about five lines and then scrolls inside itself.
 */
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactElement, type ReactNode, type RefObject } from 'react';
import { ArrowLeft, ArrowUp, FlipHorizontal2, Mic, PanelRight, Paperclip, Reply, X } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { PEOPLE, type PersonId } from './mock-data';
import type { Query } from './real-data';

/**
 * v14 #5: one hook for every hand-rolled popover, menu and sheet. While `on`, a pointer press outside `ref` (or
 * outside every ref given) and the Escape key both call `onClose`. Pass no ref for Escape only (a modal whose own
 * backdrop handles the outside click).
 */
export function useDismiss(onClose: () => void, on = true, refs: RefObject<HTMLElement | null>[] = []) {
  const close = useRef(onClose);
  close.current = onClose;
  const keep = useRef(refs);
  keep.current = refs;
  useEffect(() => {
    if (!on) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    const p = (e: PointerEvent | MouseEvent) => {
      const list = keep.current;
      if (list.length === 0) return;
      const t = e.target as Node;
      if (list.every((r) => !r.current || !r.current.contains(t))) close.current();
    };
    window.addEventListener('keydown', k);
    document.addEventListener('mousedown', p);
    return () => { window.removeEventListener('keydown', k); document.removeEventListener('mousedown', p); };
  }, [on]);
}

/**
 * v16 design-system pass: every labelled button is the shadcn Button. The solid blue one is the page's single primary
 * (design-system.md, Button Decision Rules #1 and the Primary CTA Pattern: bg-blue-600, hover:bg-blue-700, rounded-lg; blue-500 is the same colour, tailwind.config.js); Outline is a real alternative (#2); Quiet is a ghost (#3).
 */
export const PRIMARY_CLASS = 'min-h-11 rounded-lg bg-blue-600 text-white hover:bg-blue-700';
export function PrimaryButton({ className, ...p }: ButtonProps) { return <Button className={cn(PRIMARY_CLASS, className)} {...p} />; }
export function OutlineButton({ className, ...p }: ButtonProps) { return <Button variant="outline" className={cn('min-h-10', className)} {...p} />; }
export function QuietButton({ className, ...p }: ButtonProps) { return <Button variant="ghost" className={cn('min-h-10 text-gray-700', className)} {...p} />; }

export const TOOL_ICON = 'h-[18px] w-[18px]';
/** A 44px hit area around a smaller visible control (the avatar and the name in a message row) without moving anything. */
export const HIT = "relative after:absolute after:-inset-2 after:content-['']";
const ROUND = 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full';

/** The dark hover tip every icon-only control carries. Needs the TooltipProvider at the prototype root. */
export function Tip({ label, children, side = 'top' }: { label: string; children: ReactElement; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="bg-gray-900 px-2 py-1 text-xs font-medium text-white">{label}</TooltipContent>
    </Tooltip>
  );
}

const AVATAR_SIZE = { xs: '!h-5 !w-5 !text-[10px]', sm: '!h-8 !w-8 !text-xs', md: '!h-9 !w-9', list: '!h-12 !w-12', lg: '!h-20 !w-20 !text-2xl' } as const;

/** A person's round avatar: the production GravatarAvatar (blue ring if they pledged). */
export function Avatar({ person, size = 'md', className }: { person: PersonId; size?: keyof typeof AVATAR_SIZE; className?: string }) {
  const p = PEOPLE[person];
  return <GravatarAvatar name={p.name} avatarColor={p.avatarColor} photoUrl={undefined} isPledger={p.pledger} showRing={p.pledger && size !== 'xs' && size !== 'sm'} size={size === 'lg' ? 'xl' : 'sm'} className={cn(AVATAR_SIZE[size], className)} />;
}

/**
 * v15 #10, review #6: the mirror agent's avatar is MY avatar, unflipped and unfiltered (initials stay readable), with a
 * dashed ring and a small mirror badge so it never reads as me.
 * PLACEHOLDER for a generated image: the ring + badge stand in until the agent has its own picture.
 */
const BADGE_SIZE: Record<keyof typeof AVATAR_SIZE, string> = { xs: 'hidden', sm: 'h-3.5 w-3.5', md: 'h-4 w-4', list: 'h-5 w-5', lg: 'h-7 w-7' };
export function MirrorAvatar({ owner, size = 'md', className }: { owner: PersonId; size?: keyof typeof AVATAR_SIZE; className?: string }) {
  return (
    <span data-testid="mirror-avatar" data-placeholder="generated-image" className={cn('relative inline-flex shrink-0 rounded-full outline-dashed outline-2 outline-offset-1 outline-blue-400', className)}>
      <Avatar person={owner} size={size} />
      <span aria-hidden="true" data-testid="mirror-badge" className={cn('absolute -bottom-1 -right-1 items-center justify-center rounded-full bg-white text-blue-600 ring-1 ring-blue-300', size === 'xs' ? 'hidden' : 'flex', BADGE_SIZE[size])}>
        <FlipHorizontal2 className="h-[70%] w-[70%]" />
      </span>
    </span>
  );
}

/** Slack's hover toolbar, top right of a message. Phones show it on tap only: hover is gated to real pointers. */
export function Toolbar({ shown, children }: { shown: boolean; children: ReactNode }) {
  return (
    <div role="toolbar" aria-label="Message actions" className={cn('flex items-center gap-0.5 rounded-2xl border bg-white p-0.5 shadow transition-opacity', shown ? 'inline-flex opacity-100' : 'pointer-events-none absolute -top-5 right-3 z-10 opacity-0 focus-within:pointer-events-auto focus-within:opacity-100 [@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:opacity-100')}>
      {children}
    </div>
  );
}

/** A toolbar button: icon, tip, and on a phone (where there is no tip) its word beside the icon. */
export function ToolButton({ label, onClick, children, text = false }: { label: string; onClick: () => void; children: ReactNode; /** v11's Clarify: the word shows at every width. */ text?: boolean }) {
  return (
    <Tip label={label}>
      <button type="button" onClick={onClick} aria-label={label} className={cn('flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg px-2.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 lg:h-9 lg:min-w-9', text ? 'lg:px-2' : 'lg:px-0')}>
        {children}
        <span className={cn('text-sm font-medium', !text && 'lg:hidden')}>{label}</span>
      </button>
    </Tip>
  );
}

/**
 * One message row (Slack anatomy): avatar, name, time, body. `compact` hides avatar and name when the sender is
 * the same as the row above. Hover (pointer devices) shows the toolbar; a tap (`selected`) shows it on its own line.
 */
/** v16: how long a finger rests on a message before its menu opens, and how far it may drift (a scroll is not a press). */
export const LONG_PRESS_MS = 500;
const LONG_PRESS_DRIFT_PX = 10;

export function Message({ person, time, compact = false, highlight = false, selected = false, onSelect, onPerson, toolbar, onContextMenu, onLongPress, children, agentName }: {
  person: PersonId; time?: string; compact?: boolean; highlight?: boolean; selected?: boolean;
  /** v15 #10: said by `person`'s mirror agent, shown under this name with the mirror avatar. */
  agentName?: string;
  onSelect?: () => void; onPerson: (p: PersonId) => void; toolbar?: ReactNode; children: ReactNode;
  /** v14 #6: right-click opens the message's context menu. */
  onContextMenu?: (e: ReactMouseEvent) => void;
  /** v16: a long press on a touch screen opens the same menu, at the finger. */
  onLongPress?: (at: { x: number; y: number }) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  const pressed = useRef(false);
  useEffect(() => { if (selected) row.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [selected]);
  useEffect(() => () => { if (press.current) window.clearTimeout(press.current.timer); }, []);
  const endPress = () => { if (press.current) window.clearTimeout(press.current.timer); press.current = null; };
  return (
    /* Right-click is a pointer shortcut only: every item it offers is also on the keyboard-reachable toolbar. */
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={row}
      data-selected={selected || undefined}
      onContextMenu={onContextMenu}
      className={cn('group relative mx-2 flex gap-2.5 rounded-xl px-2 [@media(hover:hover)]:hover:bg-gray-100', compact ? 'py-1' : 'pb-1.5 pt-2.5', selected && 'bg-gray-100', highlight && 'bg-blue-50 [@media(hover:hover)]:hover:bg-blue-50')}
      /* v16: a long press opens the message menu; the lift that ends it must not also count as a tap. */
      onTouchStart={onLongPress ? (e) => {
        const t = e.touches[0];
        if (!t || (e.target as HTMLElement).closest('button,a,input,textarea,label,[role="menu"],[role="toolbar"]')) return;
        endPress();
        const at = { x: t.clientX, y: t.clientY };
        press.current = { ...at, timer: window.setTimeout(() => { pressed.current = true; press.current = null; onLongPress(at); }, LONG_PRESS_MS) };
      } : undefined}
      onTouchMove={onLongPress ? (e) => {
        const t = e.touches[0];
        if (press.current && t && Math.hypot(t.clientX - press.current.x, t.clientY - press.current.y) > LONG_PRESS_DRIFT_PX) endPress();
      } : undefined}
      onTouchEnd={onLongPress ? () => { endPress(); pressed.current = false; } : undefined}
      onTouchCancel={onLongPress ? () => { endPress(); pressed.current = false; } : undefined}
      /* A tap selects (touch has no hover); a mouse already has the hover toolbar, so its click selects nothing. */
      onPointerUp={(e) => {
        if (pressed.current) { pressed.current = false; return; }
        if (e.pointerType !== 'mouse' && onSelect && !(e.target as HTMLElement).closest('button,a,input,textarea,label,[role="menu"],[role="toolbar"]')) onSelect();
      }}
    >
      <div className="w-9 shrink-0">{!compact && (agentName ? <MirrorAvatar owner={person} /> : <button type="button" aria-label={`Open ${PEOPLE[person].name}`} onClick={() => onPerson(person)} className={HIT}><Avatar person={person} /></button>)}</div>
      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="flex flex-wrap items-center gap-x-1.5 leading-6">
            {agentName
              ? <span className="min-w-0 max-w-full truncate text-[15px] font-semibold text-gray-900" data-testid="agent-name">{agentName}</span>
              : <button type="button" onClick={() => onPerson(person)} className={cn(HIT, 'min-w-0 max-w-full text-[15px] font-semibold text-gray-900 hover:underline hover:underline-offset-2')}><span className="block truncate">{PEOPLE[person].name}</span></button>}
            {time && <span className="text-xs text-muted-foreground">{time}</span>}
          </div>
        )}
        {children}
        {selected && toolbar && <div className="mt-1.5">{toolbar}</div>}
      </div>
      {selected ? null : toolbar}
    </div>
  );
}

export const MsgText = ({ children }: { children: ReactNode }) => <p className="whitespace-pre-wrap break-words text-[15px] leading-[22px] text-gray-900">{children}</p>;

/** Slack's centred pill on a rule. */
export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="relative my-2 flex justify-center px-4" role="separator">
      <span className="absolute inset-x-0 top-1/2 h-px bg-gray-200" aria-hidden="true" />
      <span className="relative inline-flex max-w-full items-center gap-1.5 rounded-full border bg-white px-3 py-1 text-xs font-medium text-gray-600">{children}</span>
    </div>
  );
}

/** A thread beside the conversation: a right pane from lg up, the whole screen on phones. */
export function SidePanel({ label, title, onClose, children }: { label: string; title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <section aria-label={label} data-testid="thread-panel" className="flex min-w-0 flex-1 flex-col border-l bg-white lg:w-[400px] lg:flex-none xl:w-[440px]">
      <header className="flex min-h-14 shrink-0 items-center gap-1 border-b px-2 lg:gap-2 lg:px-4">
        <button type="button" onClick={onClose} aria-label="Back to the conversation" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 lg:hidden"><ArrowLeft className="h-5 w-5" /></button>
        <PanelRight className="hidden h-[18px] w-[18px] shrink-0 text-gray-500 lg:block" aria-hidden="true" />
        <div className="min-w-0 flex-1 truncate">{title}</div>
        <Tip label="Close thread" side="bottom">
          <button type="button" onClick={onClose} aria-label="Close thread" className="-mr-2 hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 lg:flex"><X className="h-[18px] w-[18px]" /></button>
        </Tip>
      </header>
      {children}
    </section>
  );
}

/** The quoted message above the composer, with its remove control. */
export function QuoteBar({ author, text, onRemove }: { author: string; text: string; onRemove: () => void }) {
  return (
    <div className="flex items-start gap-2 px-2 pb-1 pt-1" data-testid="reply-bar">
      <Reply className="mt-1 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
      <div className="min-w-0 flex-1 border-l-2 border-blue-600 pl-2">
        <p className="truncate text-xs font-semibold text-blue-700">{author}</p>
        <p className="truncate text-sm text-gray-700">{text}</p>
      </div>
      <button type="button" aria-label="Cancel reply" onClick={onRemove} className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
    </div>
  );
}

/** Five 24px lines plus the field's 16px vertical padding. */
export const COMPOSER_MAX = 136;

/** Seconds as m:ss. */
export const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

/** The voice control captures nothing in this prototype, so it says so before anyone uses it (a tooltip, and the name a screen reader hears). */
export const VOICE_LABEL = 'Record a voice message (mock: no audio is recorded)';

/**
 * The composer (WhatsApp/Telegram anatomy): 📎 on the LEFT, the field, then 🎤 while the field is empty and Send once
 * there is text. The mic makes a MOCK voice note (no audio is captured, and the row says so): a timer row with Cancel and Send; under a second it is dropped.
 */

export function Composer({ placeholder, value, onValue, onSend, onVoice, quote, onAttach, inputId, canSendEmpty = false }: {
  /** Send shows with an empty field (an attachment is staged). */
  canSendEmpty?: boolean;
  placeholder: string; value: string; onValue: (t: string) => void; onSend: (t: string) => void; onVoice?: (secs: number) => void;
  quote?: ReactNode; onAttach?: () => void; inputId?: string;
}) {
  const [rec, setRec] = useState<number | null>(null);
  const recording = rec !== null;
  useEffect(() => {
    if (!recording) return;
    const t = window.setInterval(() => setRec((s) => (s === null ? null : s + 1)), 1000);
    return () => window.clearInterval(t);
  }, [recording]);
  const field = useRef<HTMLTextAreaElement>(null);
  /* v14 #12: grow with the text up to ~5 lines (24px each + padding), then scroll inside the field. */
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    const full = el.scrollHeight;
    el.style.height = `${Math.min(full || 40, COMPOSER_MAX)}px`;
    el.style.overflowY = full > COMPOSER_MAX ? 'auto' : 'hidden';
  }, [value]);
  const sendable = value.trim() !== '' || canSendEmpty;
  const send = () => { const t = value.trim(); if (!t && !canSendEmpty) return; onValue(''); onSend(t); };
  const stop = () => { const s = rec ?? 0; setRec(null); onVoice?.(s); };
  return (
    <footer className="relative shrink-0 px-2 pb-2 pt-1 lg:px-3 lg:pb-3" data-testid="composer">
      <form className="relative mx-auto w-full max-w-3xl rounded-3xl border border-gray-300 bg-white px-1.5 py-1 focus-within:border-gray-400" onSubmit={(e) => { e.preventDefault(); send(); }}>
        {quote}
        {rec !== null ? (
          <div className="flex min-h-10 items-center gap-2 px-2" data-testid="recording">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" aria-hidden="true" />
            <span className="text-[15px] tabular-nums text-gray-900" aria-live="polite">{clock(rec)}</span>
            <span className="min-w-0 flex-1 text-sm leading-tight text-gray-600" data-testid="recording-note">Mock: no audio is recorded</span>
            <button type="button" onClick={() => setRec(null)} className="min-h-10 rounded-full px-3 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancel</button>
            <Tip label="Send voice message"><button type="button" aria-label="Send voice message" onClick={stop} className={cn(ROUND, 'bg-blue-600 text-white hover:bg-blue-700')}><ArrowUp className="h-[18px] w-[18px]" /></button></Tip>
          </div>
        ) : (
          <div className="flex items-end gap-0.5">
            {onAttach && <Tip label="Share a point or story"><button type="button" aria-label="Share a point or story" onClick={onAttach} className={cn(ROUND, 'text-gray-600 hover:bg-gray-100')}><Paperclip className="h-5 w-5" /></button></Tip>}
            <textarea ref={field} id={inputId} data-max-height={COMPOSER_MAX} value={value} onChange={(e) => onValue(e.target.value)} rows={1} placeholder={placeholder} aria-label={placeholder}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia?.('(pointer: fine)').matches) { e.preventDefault(); send(); } }}
              className="block max-h-[136px] min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-base leading-6 outline-none placeholder:text-gray-500 md:text-[15px]" />
            {sendable
              ? <Tip label="Send"><button type="submit" aria-label="Send" className={cn(ROUND, 'bg-blue-600 text-white hover:bg-blue-700')}><ArrowUp className="h-[18px] w-[18px]" /></button></Tip>
              : onVoice && <Tip label={VOICE_LABEL}><button type="button" aria-label={VOICE_LABEL} onClick={() => setRec(0)} className={cn(ROUND, 'text-gray-600 hover:bg-gray-100')}><Mic className="h-5 w-5" /></button></Tip>}
          </div>
        )}
      </form>
    </footer>
  );
}

/* ---------- v16: the states every real-data surface has besides its data ---------- */

/** Pulsing placeholders shaped like the rows they stand for. */
export function RealSkeleton({ rows = 3, what = 'content' }: { rows?: number; what?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={`Loading ${what}`} data-testid="real-skeleton" className="space-y-3 px-4 py-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex animate-pulse items-start gap-3 rounded-lg border border-border bg-card p-4">
          <div className="h-8 w-8 shrink-0 rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2"><div className="h-4 w-1/3 rounded bg-muted" /><div className="h-4 w-full rounded bg-muted" /><div className="h-4 w-3/4 rounded bg-muted" /></div>
        </div>
      ))}
    </div>
  );
}

/** The inline error: what failed and a Retry that reads again. */
export function RealError({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" data-testid="real-error" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="text-sm text-gray-700">Could not load {what}. Try again.</p>
      <OutlineButton onClick={onRetry}>Retry</OutlineButton>
    </div>
  );
}

/** An explicit empty state, never a blank panel. */
export const RealEmpty = ({ children }: { children: ReactNode }) => <div data-testid="real-empty" className="flex flex-col items-center gap-3 px-6 py-12 text-center text-sm text-gray-600">{children}</div>;

/** skeleton while loading, error with Retry, the empty node, else the data. */
export function RealBoundary<T>({ q, what, empty, skeleton, children }: { q: Query<T>; what: string; empty: ReactNode; skeleton?: ReactNode; children: (data: T) => ReactNode }) {
  if (q.status === 'loading') return <>{skeleton ?? <RealSkeleton what={what} />}</>;
  if (q.status === 'error') return <RealError what={what} onRetry={q.retry} />;
  if (q.empty || q.data === undefined) return <RealEmpty>{empty}</RealEmpty>;
  return <>{children(q.data)}</>;
}
