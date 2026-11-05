/**
 * @file RegistrationQuestions.tsx
 * @description P1529 §0: the one step between tapping Register and having a seat, for a flow that asks (D16).
 * Register is always tappable and names what is missing (a disabled button is a dead control, P955).
 * Wording is DRAFT: [FOUNDER DECISION: final copy].
 */
import { ROUND_UPDATE_CONSENT } from '@/app/components/session/capture-copy';
import { useEffect, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { formatDoorsTime } from '../event-doors';
import type { Participation, PhoneKind, RegistrationAnswers } from '@/app/data/event-registration';

/** The event page's "N places left" appears at this many or fewer (D18). No bar. */
export const PLACES_LEFT_FROM = 5;

export function PlacesLeftLine({ left }: { left: number | null }) {
  if (left === null || left <= 0 || left > PLACES_LEFT_FROM) return null;
  return (
    <p className="mt-2 text-center text-sm text-muted-foreground" data-testid="places-left">
      {left === 1 ? '1 place left' : `${left} places left`}
    </p>
  );
}

/** [FOUNDER DECISION: which channel.] Shown under "Event Full" in a flow that asks questions (D18). */
export function FullMessageHostLine() {
  return (
    <p className="mt-2 text-center text-sm text-muted-foreground" data-testid="full-message-host">
      Full? Message the host. A place may open up.
    </p>
  );
}

const PHONES: { value: PhoneKind; label: string }[] = [
  { value: 'usbc', label: 'USB-C' },
  { value: 'lightning', label: 'iPhone Lightning' },
  { value: 'other', label: 'Other' },
];

function participationOptions(doors: string): { value: Participation; label: string }[] {
  return [
    { value: 'canvas_before', label: "Get my business challenged by peers. I'll make my Clarity Canvas before the event." },
    { value: 'canvas_at_doors', label: `Get my business challenged by peers. I'll come 30 minutes earlier, at ${doors}, and make it there.` },
    { value: 'observer', label: 'Observe: practise listening and give feedback. No Clarity Canvas needed.' },
  ];
}

function ChoiceRow({ name, checked, label, onSelect }: { name: string; checked: boolean; label: string; onSelect: () => void }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm has-[:checked]:border-foreground">
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="mt-0.5" />
      <span>{label}</span>
    </label>
  );
}

function missingLine(p: Participation | null, phone: PhoneKind | null, accepted: boolean): string | null {
  if (!p) return 'Choose how you want to take part.';
  if (!phone) return 'Choose which phone you will bring.';
  if (!accepted) return 'This event needs you to accept transcription.';
  return null;
}

export function RegistrationQuestions({
  open, datetime, timezone, busy, onCancel, onSubmit,
}: {
  open: boolean;
  datetime: string;
  timezone?: string | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (answers: RegistrationAnswers) => void;
}) {
  const id = useId();
  const [participation, setParticipation] = useState<Participation | null>(null);
  const [phone, setPhone] = useState<PhoneKind | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [hope, setHope] = useState('');
  const [tried, setTried] = useState(false);
  const missing = missingLine(participation, phone, accepted);
  // Reopened after a cancel: the answers given stay, the "you have not answered" line from the earlier try does not.
  useEffect(() => { if (open) setTried(false); }, [open]);

  const submit = () => {
    setTried(true);
    if (missing || !participation || !phone || !accepted) return;
    onSubmit({ participation, phone, hope, recordingAccepted: true });
  };

  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onCancel(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" data-testid="registration-questions">
        <DialogHeader>
          <DialogTitle>One step before your seat</DialogTitle>
          <DialogDescription>A few answers so the evening works for you.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">How do you want to take part?</legend>
            {participationOptions(formatDoorsTime(datetime, timezone)).map(o => (
              <ChoiceRow key={o.value} name={`${id}-p`} checked={participation === o.value} label={o.label} onSelect={() => setParticipation(o.value)} />
            ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Which phone will you bring? We use it to record your conversations.</legend>
            {PHONES.map(o => (
              <ChoiceRow key={o.value} name={`${id}-m`} checked={phone === o.value} label={o.label} onSelect={() => setPhone(o.value)} />
            ))}
            {phone === 'other' && (
              <p className="text-sm text-muted-foreground" data-testid="bring-own-mic">Please bring a headset or microphone that fits your phone.</p>
            )}
          </fieldset>
          <label className="flex min-h-10 cursor-pointer items-start gap-3 text-sm">
            <Checkbox checked={accepted} onCheckedChange={v => setAccepted(v === true)} className="mt-0.5" data-testid="recording-accept" />
            <span>I'm fine with my conversations being transcribed and used by AI at this event. {ROUND_UPDATE_CONSENT}</span>
          </label>
          <div>
            <label htmlFor={`${id}-hope`} className="mb-2 block text-sm font-medium">What do you hope to get from this event? (optional)</label>
            <Input id={`${id}-hope`} value={hope} maxLength={500} onChange={e => setHope(e.target.value)} />
          </div>
          <p className="text-sm text-muted-foreground">Places are limited. If you can't come, please cancel so someone else can have your place.</p>
          {tried && missing && <p className="text-sm text-destructive" role="alert" data-testid="registration-missing">{missing}</p>}
          <Button className="w-full" size="lg" onClick={submit} disabled={busy} data-testid="registration-submit">
            {busy ? 'Registering...' : 'Register'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
