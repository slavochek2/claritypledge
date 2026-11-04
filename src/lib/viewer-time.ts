/**
 * @file viewer-time.ts
 * @description One clock format for places that show a moment to a reader: the VIEWER's own locale (a 12-hour reader reads 2:05 PM,
 * a 24-hour one 14:05) and the viewer's own time zone. The chat header's event time and a transcription thread's title both go
 * through here, so they cannot drift apart (P1604, founder 2026-11-04). `locale`/`timeZone` exist for tests and callers that must pin them.
 */

export interface ViewerFormat {
  locale?: string;
  timeZone?: string;
}

/** "2:05 PM" or "14:05", by the viewer's locale. */
export function viewerTime(when: string | Date, opts: ViewerFormat = {}): string {
  return new Date(when).toLocaleTimeString(opts.locale ?? [], { hour: 'numeric', minute: '2-digit', timeZone: opts.timeZone });
}

/** "3 Nov" or "Nov 3", by the viewer's locale. */
export function viewerShortDate(when: string | Date, opts: ViewerFormat = {}): string {
  return new Date(when).toLocaleDateString(opts.locale ?? [], { day: 'numeric', month: 'short', timeZone: opts.timeZone });
}
