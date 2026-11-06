/**
 * @file RegistrationQuestions.tsx
 * @description P1529 §0, D24: the one step between tapping Register and having a seat, for a flow that asks (D16). Same form
 * for registering and for the waiting list; signed out it ends in Continue and sign-in comes next. Register is always
 * tappable and names what is missing (a disabled button is a dead control, P955). Closing it keeps the answers, and says so
 * if any were given. Wording: registration-copy.ts (founder, 2026-11-05). A try with answers missing marks each missing question
 * itself (outline, its own line, aria-invalid) and focuses the first; the old summary under the form is gone, it said the same lines twice.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { formatDoorsTime } from '../event-doors';
import { choicesOf, participationOf, type JoinChoice, type PhoneKind, type PrepChoice, type RegistrationAnswers } from '@/app/data/registration-answer-model';
import { ROUND_UPDATE_CONSENT } from '@/app/components/session/capture-copy';
import * as copy from './registration-copy';

/** The event page's "x of y seats left" appears once this many people are registered (founder, UAT round 1). No bar. */
export const SEATS_LEFT_FROM_REGISTERED = 8;

export function PlacesLeftLine({ left, limit }: { left: number | null; limit: number | null }) {
  if (left === null || limit === null || left <= 0 || limit - left < SEATS_LEFT_FROM_REGISTERED) return null;
  return (
    <p className="mt-2 text-center text-sm text-muted-foreground" data-testid="places-left">
      {left} of {limit} seats left
    </p>
  );
}

function ChoiceRow({ name, checked, label, onSelect, testId, invalid }: { name: string; checked: boolean; label: string; onSelect: () => void; testId?: string; invalid?: boolean }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm has-[:checked]:border-foreground">
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="mt-0.5" data-testid={testId} aria-invalid={invalid || undefined} />
      <span>{label}</span>
    </label>
  );
}

export function missingLines(join: JoinChoice | null, prep: PrepChoice | null, phone: PhoneKind | null, accepted: boolean): string[] {
  const out: string[] = [];
  if (!join) out.push(copy.MISSING.join);
  else if (!prep) out.push(copy.MISSING.prep);
  if (!accepted) out.push(copy.MISSING.recording);
  if (!phone) out.push(copy.MISSING.phone);
  return out;
}

type QuestionKey = 'join' | 'prep' | 'recording' | 'phone';

/** Which required questions are unanswered, in the form's order (the prep question only exists once the first is answered). */
export function missingKeys(join: JoinChoice | null, prep: PrepChoice | null, phone: PhoneKind | null, accepted: boolean): QuestionKey[] {
  const out: QuestionKey[] = [];
  if (!join) out.push('join');
  else if (!prep) out.push('prep');
  if (!accepted) out.push('recording');
  if (!phone) out.push('phone');
  return out;
}

export function RegistrationQuestions({
  open, datetime, timezone, busy, onCancel, onSubmit, mode = 'register', signedIn = true, initial = null,
}: {
  open: boolean;
  datetime: string;
  timezone?: string | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (answers: RegistrationAnswers) => void;
  /** The waiting list uses the same form; only its title, button and closing line change. */
  mode?: 'register' | 'waitlist';
  /** Signed out: the form ends in Continue and the sign-in line, and nothing is sent. */
  signedIn?: boolean;
  /** Answers saved before sign-up: they fill the form. */
  initial?: RegistrationAnswers | null;
}) {
  const id = useId();
  const [join, setJoin] = useState<JoinChoice | null>(null);
  const [prep, setPrep] = useState<PrepChoice | null>(null);
  const [phone, setPhone] = useState<PhoneKind | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [hope, setHope] = useState('');
  const [tried, setTried] = useState(false);
  const missing = missingLines(join, prep, phone, accepted);
  const missingKeyList = missingKeys(join, prep, phone, accepted);
  const form = useRef<HTMLDivElement>(null);
  // A question shows its error after a try and until it is answered: derived, so answering clears it by itself.
  const bad = (k: QuestionKey) => tried && missingKeyList.includes(k);
  const errorId = (k: QuestionKey) => `${id}-err-${k}`;
  const invalidProps = (k: QuestionKey) => (bad(k) ? { 'aria-invalid': true as const, 'aria-describedby': errorId(k) } : {});
  const ring = (k: QuestionKey) => (bad(k) ? 'rounded-lg outline outline-2 outline-offset-4 outline-destructive' : '');
  const errorLine = (k: QuestionKey, text: string) =>
    bad(k) ? <p id={errorId(k)} className="mt-2 text-sm text-destructive" role="alert" data-testid={`missing-${k}`}>{text}</p> : null;
  const waitlist = mode === 'waitlist';
  // Reopened after a close: the answers given stay, the "you have not answered" lines from the earlier try do not.
  useEffect(() => { if (open) setTried(false); }, [open]);
  useEffect(() => {
    const c = initial ? choicesOf(initial) : null;
    if (!initial || !c) return;
    setJoin(c.join); setPrep(c.prep); setPhone(initial.phone); setAccepted(true); setHope(initial.hope);
  }, [initial]);

  const chooseJoin = (next: JoinChoice) => {
    if (next === join) return;
    setJoin(next);
    setPrep(null); // the second question depends on the first answer
  };
  const answered = !!(join || prep || phone || accepted || hope.trim());
  const close = () => {
    if (answered) toast(waitlist ? copy.WAITLIST_CLOSED_UNFINISHED : copy.CLOSED_UNFINISHED);
    onCancel();
  };
  const submit = () => {
    setTried(true);
    if (missing.length > 0 || !join || !prep || !phone || !accepted) {
      // The first missing question scrolls into view and takes focus (its first option).
      const first = form.current?.querySelector<HTMLElement>(`[data-question="${missingKeyList[0]}"] input, [data-question="${missingKeyList[0]}"] button[role="checkbox"]`);
      first?.focus();
      first?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      return;
    }
    onSubmit({ ...participationOf(join, prep), phone, hope, recordingAccepted: true });
  };

  const doors = formatDoorsTime(datetime, timezone);
  const buttonLabel = !signedIn ? copy.CONTINUE_LABEL : busy ? (waitlist ? 'Joining...' : 'Registering...') : waitlist ? copy.WAITLIST_BUTTON : copy.FORM_TITLE;

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) close(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" data-testid="registration-questions">
        <DialogHeader>
          <DialogTitle>{waitlist ? copy.WAITLIST_TITLE : copy.FORM_TITLE}</DialogTitle>
          <DialogDescription>{copy.FORM_LINE}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5" ref={form}>
          <fieldset className={`space-y-2 ${ring('join')}`} data-question="join" {...invalidProps('join')}>
            <legend className="mb-2 text-sm font-medium">{copy.JOIN_QUESTION}</legend>
            {copy.JOIN_OPTIONS.map(o => (
              <ChoiceRow key={o.value} name={`${id}-j`} checked={join === o.value} label={o.label} onSelect={() => chooseJoin(o.value)} testId={`join-${o.value}`} invalid={bad('join')} />
            ))}
            {errorLine('join', copy.MISSING.join)}
          </fieldset>
          {join && (
            <fieldset className={`space-y-2 ${ring('prep')}`} data-testid="prep-question" data-question="prep" {...invalidProps('prep')}>
              <legend className="mb-2 text-sm font-medium">{copy.prepQuestion(join)}</legend>
              {copy.prepOptions(join, doors).map(o => (
                <ChoiceRow key={o.value} name={`${id}-p-${join}`} checked={prep === o.value} label={o.label} onSelect={() => setPrep(o.value)} testId={`prep-${o.value}`} invalid={bad('prep')} />
              ))}
              {errorLine('prep', copy.MISSING.prep)}
            </fieldset>
          )}
          <div data-question="recording">
            <label className={`flex min-h-10 cursor-pointer items-start gap-3 text-sm ${ring('recording')}`}>
              <Checkbox checked={accepted} onCheckedChange={v => setAccepted(v === true)} className="mt-0.5" data-testid="recording-accept" {...invalidProps('recording')} />
              <span data-testid="recording-label">{ROUND_UPDATE_CONSENT}</span>
            </label>
            {errorLine('recording', copy.MISSING.recording)}
          </div>
          <fieldset className={`space-y-2 ${ring('phone')}`} data-question="phone" {...invalidProps('phone')}>
            <legend className="mb-2 text-sm font-medium">{copy.PHONE_QUESTION}</legend>
            {copy.PHONES.map(o => (
              <ChoiceRow key={o.value} name={`${id}-m`} checked={phone === o.value} label={o.label} onSelect={() => setPhone(o.value)} invalid={bad('phone')} />
            ))}
            {phone === 'other' && (
              <p className="text-sm text-muted-foreground" data-testid="bring-own-mic">{copy.BRING_OWN_MIC}</p>
            )}
            {errorLine('phone', copy.MISSING.phone)}
          </fieldset>
          <div>
            <label htmlFor={`${id}-hope`} className="mb-2 block text-sm font-medium">{copy.HOPE_QUESTION}</label>
            <Input id={`${id}-hope`} value={hope} maxLength={500} onChange={e => setHope(e.target.value)} />
          </div>
          <Button className="w-full" size="lg" onClick={submit} disabled={busy} data-testid="registration-submit">
            {buttonLabel}
          </Button>
          {!signedIn && <p className="-mt-2 text-center text-sm text-muted-foreground" data-testid="sign-in-line">{waitlist ? copy.WAITLIST_SIGN_IN_LINE : copy.SIGN_IN_LINE}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
