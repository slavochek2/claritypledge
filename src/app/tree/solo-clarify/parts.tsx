/**
 * @file parts.tsx
 * @description P1722 exploration: the pieces every /tree/solo-clarify screen draws. The point card frame, the
 * visibility icons, the position buttons and the Mirror's face are the product's own; the chat around them is a
 * render-only stand-in (no network, no auth). Toasts are not mounted on /tree, so what a tap would do is said inline.
 */
import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { Check, Globe, Lock, Pencil, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PointCardShell } from '@/app/components/shared/presentational/point-card-shell';
import { InlineVisibilityIcon, VisibilityBadge } from '@/app/components/shared/visibility-badge';
import { PositionButtons, type SevenPointCounts } from '@/app/components/shared';
import { MirrorGlyph, MirrorMark } from '@/app/pages/chat/chat-kit';
import { cn } from '@/lib/utils';
import { removeTag, type FakeMessage, type Visibility } from './model';
import { allTags, type DraftState } from './draft';
import { TagChips, TagInput } from './tags';
import type { Position } from '@/app/components/shared/prototype-types';

const NO_COUNTS: SevenPointCounts = {
  strongly_agree: 0, agree: 0, somewhat_agree: 0, unsure: 0, somewhat_disagree: 0, disagree: 0, strongly_disagree: 0,
};

const QUIET = 'min-h-11 text-muted-foreground';

/** A prototype annotation, never product UI: what the screen is asking the founder to judge. */
export function Note({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-dashed border-gray-400 bg-white px-3 py-2 text-sm text-gray-700">{children}</div>;
}

/** What a tap would do, said in place of the product's toast. */
export function Said({ children }: { children: ReactNode }) {
  return <p role="status" className="rounded-md border border-dashed border-gray-400 bg-white px-3 py-2 text-sm text-gray-700"><span className="font-medium">Would happen: </span>{children}</p>;
}

/** Takes focus when it appears: the button that led here has gone (focus would fall to the page), or what it made appears out of view. */
export function Arrive({ on = true, label, className, children }: { on?: boolean; label?: string; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (on) ref.current?.focus(); }, [on]);
  return <div ref={ref} tabIndex={-1} role={label ? 'group' : undefined} aria-label={label} className={cn('outline-none', className)}>{children}</div>;
}

/** The Mirror's reply once a point is made. */
export function Confirm({ focus = true, children }: { focus?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (focus) ref.current?.focus(); }, [focus]);
  return <p ref={ref} tabIndex={-1} className="text-sm outline-none">{children}</p>;
}

/** The Clarify control as messages wear it: the Mirror's glyph and the word. */
export function ClarifyChip({ onClick, label = 'Clarify', ref }: { onClick: () => void; label?: string; ref?: Ref<HTMLButtonElement> }) {
  return (
    <Button ref={ref} type="button" variant="outline" size="sm" className="h-10 min-h-10 gap-1.5" onClick={onClick}>
      <MirrorGlyph className="h-4 w-4" />{label}
    </Button>
  );
}

export function ChatFrame({ title, mirror = false, action, children }: { title: string; mirror?: boolean; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background" aria-label={title}>
      <header className="flex min-h-14 items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {mirror && <MirrorMark size="md" imageUrl={null} />}
          <h2 className="truncate text-base font-semibold">{title}</h2>
        </div>
        {action}
      </header>
      <div className="flex flex-col gap-3 p-3">{children}</div>
    </section>
  );
}

export function Bubble({ msg, name, onClarify }: { msg: FakeMessage; name: string; onClarify?: (m: FakeMessage) => void }) {
  const mine = msg.who === 'me';
  return (
    <div className={cn('flex max-w-[92%] flex-col gap-1', mine ? 'self-end items-end' : 'self-start items-start')}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{msg.speaker ?? name}</span>
        <span>{msg.time}</span>
        {msg.transcribed && <span className="rounded-full bg-muted px-2 py-0.5">Transcribed</span>}
      </div>
      <p className={cn('break-words rounded-lg px-3 py-2 text-sm', mine ? 'bg-blue-50 text-foreground' : 'bg-muted text-foreground')}>{msg.text}</p>
      {onClarify && <ClarifyChip onClick={() => onClarify(msg)} />}
    </div>
  );
}

/** One Mirror message: its face and name on one line, what it says under them across the width (as ClarifyDrafts does). */
export function MirrorTurn({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-sm font-medium"><MirrorMark size="md" imageUrl={null} />{name}</div>
      {children}
    </div>
  );
}

/**
 * A radio group drawn as light blue pills: the chosen one a shade darker, bold and ticked, so it never competes with the
 * filled primary on the screen (one primary per view). Used for Private/Public and for the prototype's variant switches.
 */
export function Choice<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { id: T; label: string; icon?: typeof Lock }[]; onChange: (v: T) => void;
}) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2">
      {options.map(o => {
        const on = value === o.id;
        const Icon = on ? Check : o.icon;
        return (
          <label key={o.id} className={cn('inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border border-blue-600 px-3 text-sm text-blue-700 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring', on ? 'bg-blue-100 font-semibold' : 'bg-blue-50')}>
            <input type="radio" name={name} value={o.id} checked={on} onChange={() => onChange(o.id)} className="sr-only" />
            {Icon && <Icon className="h-4 w-4" aria-hidden />}{o.label}
          </label>
        );
      })}
    </div>
  );
}

export function VisibilityChoice({ value, onChange, label = 'Who can see this point' }: { value: Visibility; onChange: (v: Visibility) => void; label?: string }) {
  return <Choice<Visibility> label={label} value={value} onChange={onChange} options={[{ id: 'private', label: 'Private', icon: Lock }, { id: 'public', label: 'Public', icon: Globe }]} />;
}

/**
 * The Mirror's draft, on the product's point card frame. `choose`: the card carries the Private/Public choice;
 * otherwise it only shows the lock (every draft starts private). The actions under the card are the caller's.
 */
export function DraftCard({ draft, update, choose, onPublicPick, actions, focus = false, focusLabel = 'New draft point' }: {
  draft: DraftState;
  update: (p: Partial<DraftState>) => void;
  choose: boolean;
  /** Intercepts a switch to Public (the warning dialog); without it the switch is immediate. */
  onPublicPick?: () => void;
  actions: ReactNode;
  /** Take focus on arrival (after Start over or Another point, whose button is gone). */
  focus?: boolean;
  /** What the arrival announces, when the draft's origin sits outside the card. */
  focusLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [before, setBefore] = useState(draft.text);
  const editBtn = useRef<HTMLButtonElement>(null);
  const back = useRef(false);
  useEffect(() => { if (!editing && back.current) { back.current = false; editBtn.current?.focus(); } }, [editing]);
  const startEdit = () => { setBefore(draft.text); setEditing(true); };
  const endEdit = () => { back.current = true; setEditing(false); };
  const cancelEdit = () => { update({ text: before }); endEdit(); };
  const hintId = useId();
  const { statement, tags } = allTags(draft);
  const pick = (v: Visibility) => (v === 'public' && draft.visibility !== 'public' && onPublicPick ? onPublicPick() : update({ visibility: v }));
  return (
    <Arrive on={focus} label={focusLabel} className="flex flex-col gap-2">
      <PointCardShell
        aria-label={statement.trim() ? `Draft point: ${statement}` : 'Draft point, empty'}
        header={
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Draft</span>
            <VisibilityBadge visibility={draft.visibility} showLabel size={12} />
          </div>
        }
        statement={editing ? (
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Textarea
              autoFocus rows={3} value={draft.text} aria-label="Point text" className="text-base"
              onChange={e => update({ text: e.target.value })}
              onKeyDown={e => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); endEdit(); }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" className="h-11 min-h-11" onClick={cancelEdit}>Cancel</Button>
              <Button type="button" variant="outline" className="h-11 min-h-11" onClick={endEdit}>Done</Button>
            </div>
          </div>
        ) : (
          <p className="min-w-0 flex-1 break-words text-base font-medium text-foreground">{statement}</p>
        )}
        corner={!editing && (
          <Button type="button" variant="ghost" className={cn(QUIET, 'w-11 px-0')} aria-label="Edit" ref={editBtn} onClick={startEdit}><Pencil aria-hidden /></Button>
        )}
        footer={
          <div data-tag-scope className="flex flex-col gap-3 px-4 pb-4">
            <TagChips tags={tags} onRemove={editing ? undefined : t => update({ tags: draft.tags.filter(x => x !== t), text: removeTag(draft.text, t) })} />
            <div className="flex flex-col gap-1">
              {!editing && <TagInput hintId={hintId} onAdd={t => update({ tags: Array.from(new Set([...draft.tags, t])) })} />}
              <span id={hintId} className="text-xs text-muted-foreground">{editing ? 'Type #tag in the text to add a tag' : 'Or type #tag in the text'}</span>
            </div>
            {choose && !editing && (
              <div className="flex flex-col gap-1">
                <span aria-hidden className="text-xs text-muted-foreground">Who can see it</span>
                <VisibilityChoice label="Who can see it" value={draft.visibility} onChange={pick} />
              </div>
            )}
          </div>
        }
      >
        <div className="min-w-0 pt-2">
          <PositionButtons userPosition={draft.position} counts={NO_COUNTS} compact narrow onPositionClick={p => update({ position: p })} onClear={() => update({ position: null })} />
        </div>
      </PointCardShell>
      {editing ? null : statement.trim()
        ? <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>
        : <p className="text-sm text-muted-foreground">Write the point to create it (tags alone are not a point).</p>}
    </Arrive>
  );
}

export type ShareRule = 'public-only' | 'people';

/**
 * A point as a chat shows it, with the visibility icon in front of the statement (the feed's InlineVisibilityIcon)
 * and Share. `rule` decides what Share means on a private point: off with a reason, or "share with people".
 */
export function ChatPointCard({ statement, tags, visibility, rule, onMakePublic, position, onPosition }: {
  statement: string; tags: string[]; visibility: Visibility; rule: ShareRule; onMakePublic?: () => void;
  /** The owner's position, carried over from the draft (the card can change it, as the product's cards do). */
  position?: Position; onPosition?: (p: Position) => void;
}) {
  const [said, setSaid] = useState<ReactNode>(null);
  const shareBtn = useRef<HTMLButtonElement>(null);
  const was = useRef(visibility);
  useEffect(() => {
    if (was.current === visibility) return;
    was.current = visibility;
    if (!document.activeElement || document.activeElement === document.body) shareBtn.current?.focus();
  }, [visibility]);
  const at = `${visibility}|${rule}`;
  const [seen, setSeen] = useState(at);
  const [heard, setHeard] = useState('');
  useEffect(() => {
    if (!heard) return;
    const t = setTimeout(() => setHeard(''), 3000);
    return () => clearTimeout(t);
  }, [heard]);
  if (seen !== at) {
    if (!seen.startsWith(`${visibility}|`)) setHeard(`Now a ${visibility} point`);
    setSeen(at); setSaid(null);
  }
  const share = () => {
    if (visibility === 'public') { setSaid('Opens the share sheet: copy link, send to a chat, post. Anyone with the link can take a position.'); return; }
    if (rule === 'people') { setSaid('Opens "Share with people": pick who may see it. Only they can see it and take a position; it stays off your profile and the feed.'); return; }
    setSaid(
      <span>Private points are only yours. Make it public to share it.{' '}
        {onMakePublic && <button type="button" className="inline-flex min-h-11 items-center font-medium text-blue-700 underline underline-offset-4" onClick={onMakePublic}>Make public</button>}
      </span>,
    );
  };
  const off = visibility === 'private' && rule === 'public-only';
  return (
    <div className="flex flex-col gap-2" data-return-focus>
      <PointCardShell
        aria-label={`Point: ${statement}`}
        statement={<p className="min-w-0 flex-1 break-words text-base font-medium text-foreground"><InlineVisibilityIcon visibility={visibility} /> {statement}</p>}
        footer={
          <div className="flex items-center justify-end px-2 pb-2">
            <Button ref={shareBtn} type="button" variant="outline" data-share aria-disabled={off} className={cn('h-11 min-h-11 gap-1.5', off && 'opacity-50')} onClick={share}>
              <Share2 aria-hidden />{visibility === 'private' && rule === 'people' ? 'Share with people' : 'Share'}
            </Button>
          </div>
        }
      >
        {tags.length > 0 ? <div className="pt-2"><TagChips tags={tags} /></div> : null}
        {onPosition && (
          <div className="min-w-0 pt-2">
            <PositionButtons userPosition={position ?? null} counts={NO_COUNTS} compact narrow onPositionClick={onPosition} onClear={() => onPosition(null)} />
          </div>
        )}
      </PointCardShell>
      {said && <Said>{said}</Said>}
      <span className="sr-only" aria-live="polite">{heard}</span>
    </div>
  );
}

/** The warning before a point made from someone else's chat becomes public. */
export function MakePublicDialog({ source, extra, blocked, onConfirm, onClose }: {
  source: string; extra?: ReactNode;
  /** Why Make public cannot go ahead yet (a tap says so, the button stays focusable). */
  blocked?: string;
  onConfirm: () => void; onClose: () => void;
}) {
  const [said, setSaid] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  // The screens unmount this dialog rather than closing it, so Radix never hands focus back: return it to what opened it.
  // A Make public link goes away once the point is public, so its card's Share is the fallback.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  const [fallback] = useState(() => opener?.closest('[data-return-focus]')?.querySelector<HTMLElement>('[data-share]') ?? null);
  useEffect(() => () => {
    setTimeout(() => {
      const target = opener?.isConnected ? opener : fallback?.isConnected ? fallback : null;
      const radio = target instanceof HTMLInputElement && target.type === 'radio' && !target.checked
        ? target.closest('[role="radiogroup"]')?.querySelector<HTMLElement>('input:checked') : null;
      (radio ?? target)?.focus();
    }, 0);
  }, [opener, fallback]);
  const [seen, setSeen] = useState(blocked);
  if (seen !== blocked) { setSeen(blocked); setSaid(null); }
  const confirm = () => {
    if (blocked) { setSaid(blocked); setTries(n => n + 1); return; }
    onConfirm(); onClose();
  };
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>Make this point public?</DialogTitle>
          <DialogDescription>
            It was made from {source}. Once public, anyone can see it and take a position. Check that it holds nothing
            said in confidence: names, numbers, private details.
          </DialogDescription>
        </DialogHeader>
        {extra}
        {said && blocked && <p key={tries} role="alert" className="text-sm text-red-800">{said}</p>}
        {/* Design-system rule 7: main action filled, the other ghost; phone stacked with the main one on top */}
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" className="h-11 min-h-11" onClick={onClose}>Keep private</Button>
          <Button type="button" aria-disabled={!!blocked} className={cn('h-11 min-h-11', blocked && 'opacity-50')} onClick={confirm}>Make public</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The prototype's own switch between variants (not product UI). */
export function VariantSwitch<T extends string>({ label = 'Variant', value, options, onChange }: { label?: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return <Choice<T> label={label} value={value} options={options} onChange={onChange} />;
}
