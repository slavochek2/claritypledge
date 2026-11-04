/**
 * @file event-doors.ts
 * @description P1529 D15: doors open 30 minutes before the advertised start. Display only, in the event's own zone.
 */
export const DOORS_LEAD_MINUTES = 30;

export function formatDoorsTime(datetime: string, timezone?: string | null): string {
  const doors = new Date(new Date(datetime).getTime() - DOORS_LEAD_MINUTES * 60_000);
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, ...(timezone ? { timeZone: timezone } : {}),
  }).format(doors);
}
