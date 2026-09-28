/**
 * P1365: whether the desktop event page repeats the RSVP after the description.
 *
 * Only when the description is taller than the viewport: the two buttons are then
 * more than a screen apart, so they can never be in view together (P955, one
 * primary action per view) — by geometry, with no scroll tracking.
 *
 * Past and full events get no repeat: a disabled duplicate would be a dead control
 * and would share the top button's "Event Ended" / "Event Full" name.
 */
export type RsvpTrigger = 'sticky_bar' | 'card' | 'card_bottom';

export const RSVP_REPEAT_LABEL = 'Reserve your seat';
// Its own in-flight label: the top button's "Joining..." would give two elements the same name.
export const RSVP_REPEAT_LOADING_LABEL = 'Reserving your seat…';

export function shouldShowRsvpRepeat(s: {
  affordanceHidden: boolean;
  isRsvpd: boolean;
  isPast: boolean;
  isFull: boolean;
  descriptionTallerThanViewport: boolean;
}): boolean {
  return (
    s.descriptionTallerThanViewport &&
    !s.affordanceHidden &&
    !s.isRsvpd &&
    !s.isPast &&
    !s.isFull
  );
}
