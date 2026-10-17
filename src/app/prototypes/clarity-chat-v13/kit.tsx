/**
 * @file kit.tsx
 * @description P1509 v13 message primitives, ported from v11 (P1503 `conversation-groups/ui.tsx` and
 * `v11/frame/chat.tsx`, which live on an unshipped branch): the hover tip, the production avatar, the
 * Slack-anatomy message row with its hover toolbar (a tap on a phone), the day divider, the thread side
 * panel, the reply quote bar and the rounded composer. Trimmed to what v13 uses: no agent, no mentions.
 * The mic records a mock voice note (v11's dictation hook is not on main, so nothing is transcribed).
 */
import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { ArrowLeft, ArrowUp, Mic, PanelRight, Paperclip, Reply, X } from 'lucide-react';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { PEOPLE, type PersonId } from './mock-data';

export const TOOL_ICON = 'h-[18px] w-[18px]';
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

/** Slack's hover toolbar, top right of a message. Phones show it on tap only: hover is gated to real pointers. */
export function Toolbar({ shown, children }: { shown: boolean; children: ReactNode }) {
  return (
    <div role="toolbar" aria-label="Message actions" className={cn('flex items-center gap-0.5 rounded-2xl border bg-white p-0.5 shadow transition-opacity', shown ? 'inline-flex opacity-100' : 'pointer-events-none absolute -top-5 right-3 z-10 opacity-0 focus-within:pointer-events-auto focus-within:opacity-100 [@media(hover:hover)]:group-hover:pointer-events-auto [@media(hover:hover)]:group-hover:opacity-100')}>
      {children}
    </div>
  );
}

/** A toolbar button: icon, tip, and on a phone (where there is no tip) its word beside the icon. */
export function ToolButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tip label={label}>
      <button type="button" onClick={onClick} aria-label={label} className="flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg px-2.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 lg:h-9 lg:min-w-9 lg:px-0">
        {children}
        <span className="text-sm font-medium lg:hidden">{label}</span>
      </button>
    </Tip>
  );
}

/**
 * One message row (Slack anatomy): avatar, name, time, body. `compact` hides avatar and name when the sender is
 * the same as the row above. Hover (pointer devices) shows the toolbar; a tap (`selected`) shows it on its own line.
 */
export function Message({ person, time, compact = false, highlight = false, selected = false, onSelect, onPerson, toolbar, children }: {
  person: PersonId; time?: string; compact?: boolean; highlight?: boolean; selected?: boolean;
  onSelect?: () => void; onPerson: (p: PersonId) => void; toolbar?: ReactNode; children: ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => { if (selected) row.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [selected]);
  return (
    <div
      ref={row}
      data-selected={selected || undefined}
      className={cn('group relative mx-2 flex gap-2.5 rounded-xl px-2 [@media(hover:hover)]:hover:bg-gray-100', compact ? 'py-1' : 'pb-1.5 pt-2.5', selected && 'bg-gray-100', highlight && 'bg-blue-50 [@media(hover:hover)]:hover:bg-blue-50')}
      /* A tap selects (touch has no hover); a mouse already has the hover toolbar, so its click selects nothing. */
      onPointerUp={(e) => { if (e.pointerType !== 'mouse' && onSelect && !(e.target as HTMLElement).closest('button,a,input,textarea,label,[role="menu"],[role="toolbar"]')) onSelect(); }}
    >
      <div className="w-9 shrink-0">{!compact && <button type="button" aria-label={`Open ${PEOPLE[person].name}`} onClick={() => onPerson(person)}><Avatar person={person} /></button>}</div>
      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="flex flex-wrap items-center gap-x-1.5 leading-6">
            <button type="button" onClick={() => onPerson(person)} className="min-w-0 max-w-full truncate text-[15px] font-semibold text-gray-900 hover:underline hover:underline-offset-2">{PEOPLE[person].name}</button>
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
      <button type="button" aria-label="Cancel reply" onClick={onRemove} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
    </div>
  );
}

/** Seconds as m:ss. */
export const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;

/**
 * The composer (WhatsApp/Telegram anatomy): 📎 on the LEFT, the field, then 🎤 while the field is empty and Send once
 * there is text. The mic records a mock voice note: a red timer row with Cancel and Send; under a second it is dropped.
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
            <span className="min-w-0 flex-1 truncate text-sm text-gray-500">Recording…</span>
            <button type="button" onClick={() => setRec(null)} className="min-h-10 rounded-full px-3 text-sm font-medium text-gray-700 hover:bg-gray-100">Cancel</button>
            <Tip label="Send voice message"><button type="button" aria-label="Send voice message" onClick={stop} className={cn(ROUND, 'bg-blue-600 text-white hover:bg-blue-700')}><ArrowUp className="h-[18px] w-[18px]" /></button></Tip>
          </div>
        ) : (
          <div className="flex items-end gap-0.5">
            {onAttach && <Tip label="Attach a point or story"><button type="button" aria-label="Attach a point or story" onClick={onAttach} className={cn(ROUND, 'text-gray-600 hover:bg-gray-100')}><Paperclip className="h-5 w-5" /></button></Tip>}
            <textarea id={inputId} value={value} onChange={(e) => onValue(e.target.value)} rows={1} placeholder={placeholder} aria-label={placeholder}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia?.('(pointer: fine)').matches) { e.preventDefault(); send(); } }}
              className="block min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-base leading-6 outline-none placeholder:text-gray-500 md:text-[15px]" />
            {sendable
              ? <Tip label="Send"><button type="submit" aria-label="Send" className={cn(ROUND, 'bg-blue-600 text-white hover:bg-blue-700')}><ArrowUp className="h-[18px] w-[18px]" /></button></Tip>
              : onVoice && <Tip label="Record a voice message"><button type="button" aria-label="Record a voice message" onClick={() => setRec(0)} className={cn(ROUND, 'text-gray-600 hover:bg-gray-100')}><Mic className="h-5 w-5" /></button></Tip>}
          </div>
        )}
      </form>
    </footer>
  );
}
