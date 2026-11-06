/**
 * @file new-message-rows.tsx
 * @description P1556: the New message dialog's own rows. "My code" and "Invite a Clarity Partner" at the top (the
 * invite is no longer pinned to the bottom), and the exact-handle match above the people list. Split out of
 * NewMessageDialog.tsx to keep its function under the size limit.
 */
import { Link } from 'react-router-dom';
import { QrCode, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HandleMatch } from '@/app/data/contact-code-service';
import { FOCUS_RING, HOVER, PersonMark } from './chat-kit';
import { INVITE_PARTNER_PATH } from './chat-view-model';

// [FOUNDER DECISION: copy] — P1556 placeholders.
const COPY = { myCode: 'My code', exactHandle: 'Exact handle', askForCode: 'Ask them for their code to message' };

const ROW = 'flex min-h-14 w-full items-center gap-3 px-4 text-left text-[15px] font-medium text-foreground';
const ICON = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground';

export function NewMessageTopRows({ onMyCode, onInvite }: { onMyCode: () => void; onInvite: () => void }) {
  return (
    <div className="shrink-0 pt-1">
      <button type="button" onClick={onMyCode} className={cn(ROW, HOVER, FOCUS_RING)}>
        <span className={ICON}>
          <QrCode className="h-4 w-4" aria-hidden="true" />
        </span>
        {COPY.myCode}
      </button>
      <Link to={INVITE_PARTNER_PATH} onClick={onInvite} className={cn(ROW, HOVER, FOCUS_RING)}>
        <span className={ICON}>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
        </span>
        Invite a Clarity Partner
      </Link>
    </div>
  );
}

export function HandleHitRow({ hit, disabled, onOpen }: { hit: HandleMatch; disabled: boolean; onOpen: () => void }) {
  return (
    <div className="pb-1">
      <p className="px-4 pb-1 pt-1 text-xs font-medium text-muted-foreground">{COPY.exactHandle}</p>
      <button
        type="button"
        data-testid="new-message-handle-result"
        disabled={disabled}
        onClick={onOpen}
        className={cn('flex min-h-14 w-full items-center gap-3 px-4 text-left disabled:opacity-60', HOVER, FOCUS_RING)}
      >
        <PersonMark person={hit} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] text-foreground">{hit.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{hit.canMessage ? `@${hit.slug}` : COPY.askForCode}</span>
        </span>
      </button>
    </div>
  );
}
