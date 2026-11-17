/**
 * @file hike-answer-model.ts
 * @description P1675: the answers a hike asks before the seat (when the person will do the short introduction, how they are
 * coming, how they would help) and the rules the server enforces on them (register_for_hike, event_hike_answers checks).
 * The client applies the same rules so a form can never send what the server would refuse.
 */
export type HikeWhen = 'now' | 'later';
export type HikeTransport = 'car' | 'motorbike' | 'bike_or_foot' | 'need_ride';
export type HikeHelp = 'lead' | 'sweep' | 'welcomer' | 'transport_lead' | 'other';

export const HIKE_WHEN: readonly HikeWhen[] = ['now', 'later'];
export const HIKE_TRANSPORTS: readonly HikeTransport[] = ['car', 'motorbike', 'bike_or_foot', 'need_ride'];
export const HIKE_HELPS: readonly HikeHelp[] = ['lead', 'sweep', 'welcomer', 'transport_lead', 'other'];
export const HIKE_MAX_FREE_SEATS = 20;
export const HIKE_HELP_OTHER_MAX = 280;

export interface HikeAnswers {
  when: HikeWhen;
  transport: HikeTransport;
  /** A whole number 0..20 for car and motorbike, null for every other transport. */
  freeSeats: number | null;
  help: HikeHelp | null;
  /** 1..280 characters after trimming, exactly when help is 'other'. */
  helpOther: string | null;
}

/** "Later" is valid only strictly before the start minus 24 hours 30 minutes, so the reminder email is certain to go out. */
export function laterAllowed(eventDatetimeIso: string, nowMs: number): boolean {
  const start = new Date(eventDatetimeIso).getTime();
  // Same instant as register_for_hike: the reminder (start minus 24 h) is picked up by a 30-minute cron, so "later"
  // closes 30 minutes earlier (P1675 review fixes).
  return Number.isFinite(start) && nowMs < start - (24 * 60 + 30) * 60 * 1000;
}

export const drivesCar = (t: HikeTransport | null): boolean => t === 'car' || t === 'motorbike';

/** The answers as the server stores them: seats only for a driver, Transport lead only with "I need a ride", Other text only with Other. */
export function normalizeHikeAnswers(a: HikeAnswers): HikeAnswers {
  const freeSeats = drivesCar(a.transport) ? a.freeSeats : null;
  const help = a.help === 'transport_lead' && a.transport !== 'need_ride' ? null : a.help;
  const other = a.helpOther?.trim() ?? '';
  return { ...a, freeSeats, help, helpOther: help === 'other' ? other : null };
}

/** Whether the answers are complete and inside every rule (the form's submit gate and the draft's validator). */
export function isValidHikeAnswers(v: unknown): v is HikeAnswers {
  const a = v as Partial<HikeAnswers> | null;
  if (!a || typeof a !== 'object') return false;
  if (!HIKE_WHEN.includes(a.when as HikeWhen) || !HIKE_TRANSPORTS.includes(a.transport as HikeTransport)) return false;
  if (drivesCar(a.transport as HikeTransport)) {
    if (!Number.isInteger(a.freeSeats) || (a.freeSeats as number) < 0 || (a.freeSeats as number) > HIKE_MAX_FREE_SEATS) return false;
  } else if (a.freeSeats !== null) return false;
  if (a.help !== null && !HIKE_HELPS.includes(a.help as HikeHelp)) return false;
  if (a.help === 'transport_lead' && a.transport !== 'need_ride') return false;
  if (a.help === 'other') return typeof a.helpOther === 'string' && a.helpOther.trim().length >= 1 && a.helpOther.trim().length <= HIKE_HELP_OTHER_MAX;
  return a.helpOther === null;
}
