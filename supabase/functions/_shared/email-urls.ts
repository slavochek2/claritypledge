/**
 * @file email-urls.ts
 * @description Small pure helpers for the event emails' links and calendar dates. Moved out of email-helpers.ts (over the P1566
 * size limit) so P1675 R11's event-page base could be added without that file growing.
 */

/** The public event page, or the same path on a local TEST site when one is given (P1675 R11). */
export function eventPageUrl(slug: string, base = 'https://claritypledge.com'): string {
  return `${base}/events/${slug}`;
}

/** A date in the iCalendar UTC form (YYYYMMDDTHHMMSSZ). */
export function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}
