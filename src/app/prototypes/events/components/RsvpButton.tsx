/**
 * @file RsvpButton.tsx
 * @description P844: the RSVP action button, desktop above the description ('card') and the mobile sticky bar. P1365:
 * 'card_bottom' is the desktop repeat after a long description; it only renders when shouldShowRsvpRepeat() holds
 * (never past/full), and carries its own label and test id so no two buttons share an accessible name or a locator.
 * P1529 D18: a flow that asks before the seat adds "N places left" and, when full, the line to message the host.
 */
import { Button } from '@/components/ui/button';
import { RSVP_REPEAT_LABEL, RSVP_REPEAT_LOADING_LABEL, type RsvpTrigger } from '../rsvp-repeat';
import { FullMessageHostLine, PlacesLeftLine } from './RegistrationQuestions';

export function RsvpButton({
  trigger, isPast, isFull, loading, onRsvp, asksBeforeSeat, placesLeft,
}: {
  trigger: RsvpTrigger;
  isPast: boolean;
  isFull: boolean;
  loading: boolean;
  onRsvp: (trigger: RsvpTrigger) => void;
  asksBeforeSeat: boolean;
  placesLeft: number | null;
}) {
  if (trigger === 'card_bottom') {
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
  if (isFull) {
    return (
      <>
        <Button disabled className="w-full" size="lg" data-testid="rsvp-button">Event Full</Button>
        {asksBeforeSeat && <FullMessageHostLine />}
      </>
    );
  }
  return (
    <>
      <Button
        onClick={() => onRsvp(trigger)}
        className="w-full bg-blue-500 hover:bg-blue-700 text-white"
        size="lg"
        disabled={loading}
        data-testid="rsvp-button"
      >
        {loading ? 'Joining...' : 'Reserve a seat'}
      </Button>
      {asksBeforeSeat && <PlacesLeftLine left={placesLeft} />}
    </>
  );
}
