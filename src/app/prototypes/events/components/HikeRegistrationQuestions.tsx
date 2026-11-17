/**
 * @file HikeRegistrationQuestions.tsx
 * @description P1675 sections 1 to 3b: the one step between tapping "Reserve a seat" and having a seat on a hike. When the
 * person will do the short introduction (inside 24 hours only "now"), how they are coming (free seats for a driver, with the
 * WhatsApp nudge), and how they would help (optional, with the role's instructions shown on choice). Same shell as
 * RegistrationQuestions. A try with answers missing marks each missing question itself and focuses the first; there is no
 * disabled submit. Closing keeps the answers and says so if any were given. Words: hike-copy.ts.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_HIKE_ASKS, drivesCar, HIKE_HELP_OTHER_MAX, HIKE_MAX_FREE_SEATS, isValidHikeAnswers, laterAllowed, normalizeHikeAnswers,
  type HikeAnswers, type HikeAsks, type HikeHelp, type HikeTransport, type HikeWhen,
} from '@/app/data/hike-answer-model';
import { CONTINUE_LABEL, SIGN_IN_LINE } from './registration-copy';
import * as copy from './hike-copy';

/** The page button's own words ("Reserve a seat", unchanged by the spec), so the form that opens from it carries the same name. PROPOSED. */
const FORM_TITLE = 'Reserve a seat';

type QuestionKey = 'when' | 'transport' | 'seats' | 'other';

const ROLE_TEXT: Partial<Record<HikeHelp, string[]>> = {
  lead: [copy.HIKE_ROLE_LEAD, copy.HIKE_OFFLINE_MAPS_LINE],
  sweep: [copy.HIKE_ROLE_SWEEP, copy.HIKE_OFFLINE_MAPS_LINE],
  welcomer: [copy.HIKE_ROLE_WELCOMER],
  transport_lead: [copy.HIKE_ROLE_TRANSPORT_LEAD],
};

const ROLE_LABEL: Partial<Record<HikeHelp, string>> = {
  lead: copy.HIKE_ROLE_LABEL_LEAD,
  sweep: copy.HIKE_ROLE_LABEL_SWEEP,
  welcomer: copy.HIKE_ROLE_LABEL_WELCOMER,
  transport_lead: copy.HIKE_ROLE_LABEL_TRANSPORT_LEAD,
};

function ChoiceRow({ name, checked, label, onSelect, testId, errorId }: {
  name: string; checked: boolean; label: string; onSelect: () => void; testId?: string; errorId?: string;
}) {
  return (
    <label className="flex min-h-10 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm has-[:checked]:border-foreground">
      <input
        type="radio" name={name} checked={checked} onChange={onSelect}
        className="mt-0.5" data-testid={testId} aria-invalid={errorId ? true : undefined} aria-describedby={errorId}
      />
      <span>{label}</span>
    </label>
  );
}

/** The seats field's value as a whole number 0..20, or null when empty or outside the range. */
export function seatsOf(text: string): number | null {
  if (!/^\d{1,2}$/.test(text.trim())) return null;
  const n = Number(text);
  return n >= 0 && n <= HIKE_MAX_FREE_SEATS ? n : null;
}

/** Which required questions are unanswered, in the form's order. */
export function hikeMissingKeys(
  when: HikeWhen | null, transport: HikeTransport | null, seatsText: string, help: HikeHelp | null, other: string,
  asks: HikeAsks = DEFAULT_HIKE_ASKS,
): QuestionKey[] {
  const out: QuestionKey[] = [];
  if (!when) out.push('when');
  if (asks.transport) {
    if (!transport) out.push('transport');
    else if (drivesCar(transport) && seatsOf(seatsText) === null) out.push('seats');
  }
  if (asks.help && help === 'other' && (other.trim().length === 0 || other.trim().length > HIKE_HELP_OTHER_MAX)) out.push('other');
  return out;
}

export function HikeRegistrationQuestions({
  open, datetime, minutes, busy, onCancel, onSubmit, signedIn = true, initial = null, nowOnly = false, asks = DEFAULT_HIKE_ASKS,
}: {
  /** UAT round 1 R6: which optional questions this event asks (both by default). */
  asks?: HikeAsks;
  open: boolean;
  datetime: string;
  /** The introduction's computed length; null while it is being read (the number then shows as "…", never a guess). */
  minutes: number | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (answers: HikeAnswers) => void;
  /** Signed out: the form ends in Continue and the sign-in line, and nothing is sent. */
  signedIn?: boolean;
  /** Answers saved before sign-up, or kept after a refusal: they fill the form. */
  initial?: HikeAnswers | null;
  /** The server refused "later": only "now" is offered whatever the clock here says. */
  nowOnly?: boolean;
}) {
  const id = useId();
  const [when, setWhen] = useState<HikeWhen | null>(null);
  const [transport, setTransport] = useState<HikeTransport | null>(null);
  const [seatsText, setSeatsText] = useState('');
  const [help, setHelp] = useState<HikeHelp | null>(null);
  const [other, setOther] = useState('');
  const [attempt, setAttempt] = useState<QuestionKey[] | null>(null);
  const form = useRef<HTMLDivElement>(null);
  // "Later" is offered strictly before start minus 24 h 30 min; read once per opening so the form does not shift while it is used.
  const [later, setLater] = useState(() => laterAllowed(datetime, Date.now()));
  useEffect(() => { if (open) { setAttempt(null); setLater(laterAllowed(datetime, Date.now())); } }, [open, datetime]);
  const asksTransport = asks.transport;
  const asksHelp = asks.help;
  const laterOffered = later && !nowOnly;
  useEffect(() => { if (!laterOffered && when === 'later') setWhen(null); }, [laterOffered, when]);

  useEffect(() => {
    if (!initial) return;
    // A kept "later" is dropped here when "later" is not offered (inside the cutoff, or after a now_only refusal): the clearing
    // effect above runs before this one in the same commit, so it cannot undo a "later" set here (review 2026-11-17).
    const laterOk = laterAllowed(datetime, Date.now()) && !nowOnly;
    // Stored answers pass through the event's current settings: an answer to a question now off (or a Transport lead without a
    // ride) is dropped here, so the form never holds what it cannot show or submit. Primitives in the deps: the caller may
    // build `asks` anew each render, and a fresh object must not re-fill the form over what the person typed.
    const kept = normalizeHikeAnswers(initial, { transport: asksTransport, help: asksHelp });
    setWhen(kept.when === 'later' && !laterOk ? null : kept.when); setTransport(kept.transport);
    setSeatsText(kept.freeSeats === null ? '' : String(kept.freeSeats));
    setHelp(kept.help); setOther(kept.helpOther ?? '');
  }, [initial, asksTransport, asksHelp]);

  const missing = hikeMissingKeys(when, transport, seatsText, help, other, asks);
  const bad = (k: QuestionKey) => !!attempt?.includes(k) && missing.includes(k);
  const errorId = (k: QuestionKey) => `${id}-err-${k}`;
  const ring = (k: QuestionKey) => `rounded-lg border-2 p-3 ${bad(k) ? 'border-destructive' : 'border-transparent'}`;
  const errorLine = (k: QuestionKey, text: string) =>
    bad(k) ? <p id={errorId(k)} className="mt-2 text-sm text-destructive" role="alert" data-testid={`missing-${k}`}>{text}</p> : null;
  const rowError = (k: QuestionKey) => (bad(k) ? errorId(k) : undefined);

  useEffect(() => {
    const key = attempt?.[0];
    if (!key) return;
    const group = form.current?.querySelector<HTMLElement>(`[data-question="${key}"]`);
    group?.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true });
    group?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }, [attempt]);

  const chooseTransport = (next: HikeTransport) => {
    if (next === transport) return;
    setTransport(next);
    if (!drivesCar(next)) setSeatsText('');
    // Transport lead exists only with "I need a ride": changing the answer away from it clears the choice.
    if (next !== 'need_ride' && help === 'transport_lead') setHelp(null);
  };
  const chooseHelp = (next: HikeHelp) => { setHelp(next); if (next !== 'other') setOther(''); };

  const answered = !!(when || transport || seatsText || help || other.trim());
  const close = () => {
    if (answered) toast(copy.HIKE_CLOSED_UNFINISHED);
    onCancel();
  };
  const submit = () => {
    setAttempt(missing);
    if (missing.length > 0 || !when || (asks.transport && !transport)) return;
    // Built through the same normalizer the server's rules come from, so a stale Transport lead or ride never dead-ends the submit.
    const answers = normalizeHikeAnswers({
      when, transport, freeSeats: drivesCar(transport) ? seatsOf(seatsText) : null, help,
      helpOther: help === 'other' ? other.trim() : null,
    }, asks);
    if (isValidHikeAnswers(answers, asks)) onSubmit(answers);
  };

  const n = minutes === null ? '…' : String(minutes);
  const seats = seatsOf(seatsText);
  const buttonLabel = !signedIn ? CONTINUE_LABEL : busy ? 'Registering...' : FORM_TITLE;

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) close(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" data-testid="hike-registration-questions">
        <DialogHeader>
          <DialogTitle>{FORM_TITLE}</DialogTitle>
          <DialogDescription data-testid="hike-lead-line">{copy.HIKE_LEAD_LINE}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5" ref={form}>
          <fieldset className={ring('when')} data-question="when">
            <legend className="sr-only">When will you do the introduction?</legend>
            <div className="space-y-2">
              <ChoiceRow name={`${id}-w`} checked={when === 'now'} label={copy.hikeNowOption(n)} onSelect={() => setWhen('now')} testId="hike-when-now" errorId={rowError('when')} />
              {laterOffered && (
                <ChoiceRow name={`${id}-w`} checked={when === 'later'} label={copy.HIKE_LATER_OPTION} onSelect={() => setWhen('later')} testId="hike-when-later" errorId={rowError('when')} />
              )}
              {errorLine('when', copy.HIKE_MISSING.when)}
            </div>
          </fieldset>

          {asks.transport && (
          <fieldset className={ring('transport')} data-question="transport">
            <legend className="float-left mb-3 w-full p-0 text-sm font-medium">{copy.HIKE_TRANSPORT_QUESTION}</legend>
            <div className="clear-both space-y-2">
              {copy.HIKE_TRANSPORT_OPTIONS.map(o => (
                <ChoiceRow key={o.value} name={`${id}-t`} checked={transport === o.value} label={o.label} onSelect={() => chooseTransport(o.value)} testId={`hike-transport-${o.value}`} errorId={rowError('transport')} />
              ))}
              {transport === 'need_ride' && (
                <p className="text-sm text-muted-foreground" data-testid="hike-ride-line">{copy.HIKE_NEED_RIDE_LINE}</p>
              )}
              {errorLine('transport', copy.HIKE_MISSING.transport)}
            </div>
          </fieldset>
          )}

          {asks.transport && drivesCar(transport) && (
            <div className={ring('seats')} data-question="seats">
              <label htmlFor={`${id}-seats`} className="mb-2 block text-sm font-medium">{copy.HIKE_FREE_SEATS_QUESTION}</label>
              <Input
                id={`${id}-seats`} className="h-10" type="number" inputMode="numeric" min={0} max={HIKE_MAX_FREE_SEATS} step={1} value={seatsText}
                onChange={e => setSeatsText(e.target.value)} data-testid="hike-free-seats"
                aria-invalid={bad('seats') ? true : undefined} aria-describedby={rowError('seats')}
              />
              {errorLine('seats', copy.HIKE_MISSING.seats)}
              {seats !== null && seats >= 1 && (
                <p className="mt-2 text-sm text-muted-foreground" data-testid="hike-whatsapp-line">{copy.HIKE_WHATSAPP_FREE_SEATS_LINE}</p>
              )}
            </div>
          )}

          {asks.help && (
          <fieldset className="rounded-lg border-2 border-transparent p-3" data-question="help">
            <legend className="float-left mb-1 w-full p-0 text-sm font-medium">{copy.HIKE_HELP_QUESTION}</legend>
            <p className="clear-both mb-3 text-sm text-muted-foreground" data-testid="hike-help-line">{copy.HIKE_HELP_LINE}</p>
            <div className="space-y-2">
              <ChoiceRow
                name={`${id}-h`} checked={help === null} label={copy.HIKE_JUST_ATTEND_OPTION}
                onSelect={() => { setHelp(null); setOther(''); }} testId="hike-help-none"
              />
              {copy.HIKE_HELP_OPTIONS.filter(o => o.value !== 'transport_lead' || (asks.transport && transport === 'need_ride')).map(o => (
                <ChoiceRow
                  key={o.value} name={`${id}-h`} checked={help === o.value} label={o.label}
                  onSelect={() => chooseHelp(o.value)} testId={`hike-help-${o.value}`}
                />
              ))}
              {help && ROLE_TEXT[help] && (
                <div className="space-y-2 text-sm text-muted-foreground" data-testid="hike-role-instructions">
                  <p className="font-medium text-foreground" data-testid="hike-role-heading">{copy.hikeRoleHeading(ROLE_LABEL[help] ?? '')}</p>
                  {ROLE_TEXT[help]?.map(line => <p key={line}>{line}</p>)}
                </div>
              )}
            </div>
          </fieldset>
          )}

          {asks.help && help === 'other' && (
            <div className={ring('other')} data-question="other">
              <Textarea
                value={other} maxLength={HIKE_HELP_OTHER_MAX} onChange={e => setOther(e.target.value)} placeholder={copy.HIKE_HELP_OTHER_PLACEHOLDER}
                aria-label={copy.HIKE_HELP_QUESTION} data-testid="hike-help-other-text"
                aria-invalid={bad('other') ? true : undefined} aria-describedby={rowError('other')}
              />
              {errorLine('other', copy.HIKE_MISSING.other)}
            </div>
          )}

          <Button className="w-full" size="lg" onClick={submit} disabled={busy} data-testid="hike-registration-submit">
            {buttonLabel}
          </Button>
          {!signedIn && <p className="-mt-2 text-center text-sm text-muted-foreground" data-testid="sign-in-line">{SIGN_IN_LINE}</p>}
          <p className="text-center text-sm text-muted-foreground" data-testid="hike-privacy-line">{copy.HIKE_PRIVACY_LINE}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
