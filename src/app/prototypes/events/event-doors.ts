/**
 * @file event-doors.ts
 * @description P1529 D15: doors open 30 minutes before the advertised start. Display only, in the event's own zone.
 */
import { canvasAtEvent } from './prep/prep-timing';

export const DOORS_LEAD_MINUTES = 30;
/** P1529 E3 (founder): in a sales mastermind with the canvas at the event, "come early" is 15 minutes before the start. */
export const EARLY_LEAD_MINUTES = 15;
export function arrivalLeadMinutes(event: Parameters<typeof canvasAtEvent>[0]): number {
  return canvasAtEvent(event) ? EARLY_LEAD_MINUTES : DOORS_LEAD_MINUTES;
}

function clock(at: Date, timezone?: string | null): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, ...(timezone ? { timeZone: timezone } : {}),
  }).format(at);
}

export function formatDoorsTime(datetime: string, timezone?: string | null, lead = DOORS_LEAD_MINUTES): string {
  return clock(new Date(new Date(datetime).getTime() - lead * 60_000), timezone);
}

/** P1529 UAT round 1: when a person arrives: the doors time if they chose to prepare at the event, else the start. */
export function arrivalDate(datetime: string, atDoors: boolean, lead = DOORS_LEAD_MINUTES): Date {
  const start = new Date(datetime).getTime();
  return new Date(atDoors ? start - lead * 60_000 : start);
}

/** The calendar invite's window for a person: from their own arrival to the event's end. */
export function calendarWindow(datetime: string, durationMinutes: number, atDoors: boolean, lead = DOORS_LEAD_MINUTES): { startDate: Date; endDate: Date } {
  return {
    startDate: arrivalDate(datetime, atDoors, lead),
    endDate: new Date(new Date(datetime).getTime() + durationMinutes * 60_000),
  };
}

/** The thank-you's line with the person's own time. [FOUNDER DECISION: wording for the doors time; the start keeps "We start at {start} sharp."] */
export function ownTimeLine(datetime: string, atDoors: boolean, timezone?: string | null, lead = DOORS_LEAD_MINUTES): string {
  return atDoors
    ? `Please come at ${formatDoorsTime(datetime, timezone, lead)}.`
    : `We start at ${formatStartTime(datetime, timezone)} sharp.`;
}

/** The advertised start, in the same form as the doors time (registration's "I'll come on time at {start}"). */
export function formatStartTime(datetime: string, timezone?: string | null): string {
  return clock(new Date(datetime), timezone);
}
