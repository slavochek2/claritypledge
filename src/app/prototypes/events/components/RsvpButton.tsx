/**
 * @file RsvpButton.tsx
 * @description P844: the RSVP action button, desktop above the description ('card') and the mobile sticky bar. P1365:
 * 'card_bottom' is the desktop repeat after a long description; it only renders when shouldShowRsvpRepeat() holds
 * (never past/full), and carries its own label and test id so no two buttons share an accessible name or a locator.
 * P1529 D18, D24: a flow that asks before the seat says "Register" and adds "N places left"; when full its button is "Join the waiting list"
 * (or, once joined, the quiet line and "Leave the waiting list"). A listed person who finds a place free sees Register (their
 * answers filled in) and the same Leave. Joining the list is not a seat.
 */
import { Button } from '@/components/ui/button';
import { RSVP_REPEAT_LABEL, RSVP_REPEAT_LOADING_LABEL, type RsvpTrigger } from '../rsvp-repeat';
import { PlacesLeftLine } from './RegistrationQuestions';
import { FORM_TITLE as REGISTER_LABEL, JUST_FILLED,WAITLIST_BUTTON, WAITLIST_JOINED, WAITLIST_LEAVE } from './registration-copy';

/** In-flight label of a Register button in the asking flow, top and repeat alike. */
const REGISTERING_LABEL = 'Registering...';

/** The quiet way off the list: a ghost Button, disabled while the request is out. */
function LeaveLink({ leaving, onLeave }: { leaving: boolean; onLeave: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="mt-2 min-h-10 text-muted-foreground underline" onClick={onLeave} disabled={leaving} data-testid="waitlist-leave">
      {WAITLIST_LEAVE}
    </Button>
  );
}

export function RsvpButton({
  trigger, isPast, isFull, loading, onRsvp, asksBeforeSeat, placesLeft, placesLimit = null, waitlist,
}: {
  trigger: RsvpTrigger;
  isPast: boolean;
  isFull: boolean;
  loading: boolean;
  onRsvp: (trigger: RsvpTrigger) => void;
  asksBeforeSeat: boolean;
  placesLeft: number | null;
  /** The event's limit (y of "x of y seats left"); null when none is set. */
  placesLimit?: number | null;
  /** Only in a flow that asks: the waiting list's state. */
  waitlist?: { onList: boolean; filled: boolean; leaving: boolean; onLeave: () => void };
}) {
  if (trigger === 'card_bottom' && asksBeforeSeat && isPast) return null;
  if (trigger === 'card_bottom' && asksBeforeSeat) {
    // The repeat behaves and looks like the top button (same variant from the Button, same loading text, same full handling),
    // only its test id differs. Once the person is on the list the top line already says so.
    if (isFull) {
      if (waitlist?.onList) return null;
      return (
        <Button onClick={() => onRsvp(trigger)} className="w-full" size="lg" disabled={loading} data-testid="rsvp-button-repeat">
          {WAITLIST_BUTTON}
        </Button>
      );
    }
    return (
      <>
        <Button onClick={() => onRsvp(trigger)} className="w-full" size="lg" disabled={loading} data-testid="rsvp-button-repeat">
          {loading ? REGISTERING_LABEL : REGISTER_LABEL}
        </Button>
        <PlacesLeftLine left={placesLeft} limit={placesLimit} />
      </>
    );
  }
  if (trigger === 'card_bottom') {
    // Clarity Night and Social Hike: unchanged.
    return (
      <Button
        onClick={() => onRsvp(trigger)}
        className="w-full bg-blue-500 hover:bg-blue-700 text-white"
        size="lg"
        disabled={loading}
        data-testid="rsvp-button-repeat"
      >
        {loading ? RSVP_REPEAT_LOADING_LABEL : RSVP_REPEAT_LABEL}
      </Button>
    );
  }
  if (isPast) {
    return <Button disabled className="w-full" size="lg" data-testid="rsvp-button">Event Ended</Button>;
  }
  if (isFull && asksBeforeSeat) {
    if (waitlist?.onList) {
      return (
        <div className="text-center text-sm" data-testid="waitlist-joined">
          <p>{WAITLIST_JOINED}</p>
          <LeaveLink leaving={waitlist.leaving} onLeave={waitlist.onLeave} />
        </div>
      );
    }
    return (
      <>
        {waitlist?.filled && <p className="mb-2 text-center text-sm" role="status" data-testid="just-filled">{JUST_FILLED}</p>}
        <Button onClick={() => onRsvp(trigger)} className="w-full" size="lg" disabled={loading} data-testid="rsvp-button">
          {WAITLIST_BUTTON}
        </Button>
      </>
    );
  }
  if (isFull) {
    return <Button disabled className="w-full" size="lg" data-testid="rsvp-button">Event Full</Button>;
  }
  return (
    <>
      <Button
        onClick={() => onRsvp(trigger)}
        className={asksBeforeSeat ? 'w-full' : 'w-full bg-blue-500 hover:bg-blue-700 text-white'}
        size="lg"
        disabled={loading}
        data-testid="rsvp-button"
      >
        {loading ? (asksBeforeSeat ? REGISTERING_LABEL : 'Joining...') : asksBeforeSeat ? REGISTER_LABEL : 'Reserve a seat'}
      </Button>
      {asksBeforeSeat && <PlacesLeftLine left={placesLeft} limit={placesLimit} />}
      {asksBeforeSeat && waitlist?.onList && <div className="text-center"><LeaveLink leaving={waitlist.leaving} onLeave={waitlist.onLeave} /></div>}
    </>
  );
}
