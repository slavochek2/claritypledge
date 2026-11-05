/**
 * @file event-doors.ts
 * @description P1529 D15: doors open 30 minutes before the advertised start. Display only, in the event's own zone.
 */
export const DOORS_LEAD_MINUTES = 30;

function clock(at: Date, timezone?: string | null): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, ...(timezone ? { timeZone: timezone } : {}),
  }).format(at);
}

export function formatDoorsTime(datetime: string, timezone?: string | null): string {
  return clock(new Date(new Date(datetime).getTime() - DOORS_LEAD_MINUTES * 60_000), timezone);
}

/** The advertised start, in the same form as the doors time (registration's "I'll come on time at {start}"). */
export function formatStartTime(datetime: string, timezone?: string | null): string {
  return clock(new Date(datetime), timezone);
}
