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

/** UAT round 1 R6: which optional questions the event asks. Both default to true (every existing hike asks both). */
export interface HikeAsks {
  transport: boolean;
  help: boolean;
}
export const DEFAULT_HIKE_ASKS: HikeAsks = { transport: true, help: true };

/** "Absent means asked": a question is on unless it is explicitly false (null, undefined and a missing column all mean asked). */
export const isAsked = (v: boolean | null | undefined): boolean => v !== false;

/** The event's two settings as a HikeAsks (absent means asked). */
export const hikeAsksOf = (e: { hikeAsksTransport?: boolean | null; hikeAsksHelp?: boolean | null } | null | undefined): HikeAsks => ({
  transport: isAsked(e?.hikeAsksTransport),
  help: isAsked(e?.hikeAsksHelp),
});

export interface HikeAnswers {
  when: HikeWhen;
  /** Null exactly when the event does not ask how people are coming. */
  transport: HikeTransport | null;
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
export function normalizeHikeAnswers(a: HikeAnswers, asks: HikeAsks = DEFAULT_HIKE_ASKS): HikeAnswers {
  const transport = asks.transport ? a.transport : null;
  const freeSeats = drivesCar(transport) ? a.freeSeats : null;
  const wanted = asks.help ? a.help : null;
  const help = wanted === 'transport_lead' && transport !== 'need_ride' ? null : wanted;
  const other = a.helpOther?.trim() ?? '';
  return { ...a, transport, freeSeats, help, helpOther: help === 'other' ? other : null };
}

/** The transport answer and its free seats are consistent with what the event asks. */
function validTransportAndSeats(a: Partial<HikeAnswers>, asks: HikeAsks): boolean {
  if (asks.transport ? !HIKE_TRANSPORTS.includes(a.transport as HikeTransport) : a.transport !== null) return false;
  if (drivesCar(a.transport ?? null)) {
    return Number.isInteger(a.freeSeats) && (a.freeSeats as number) >= 0 && (a.freeSeats as number) <= HIKE_MAX_FREE_SEATS;
  }
  return a.freeSeats === null;
}

/** Whether the answers are complete and inside every rule (the form's submit gate and the draft's validator). */
export function isValidHikeAnswers(v: unknown, asks: HikeAsks = DEFAULT_HIKE_ASKS): v is HikeAnswers {
  const a = v as Partial<HikeAnswers> | null;
  if (!a || typeof a !== 'object') return false;
  if (!HIKE_WHEN.includes(a.when as HikeWhen)) return false;
  if (!validTransportAndSeats(a, asks)) return false;
  if (!asks.help && a.help !== null) return false;
  if (a.help !== null && !HIKE_HELPS.includes(a.help as HikeHelp)) return false;
  if (a.help === 'transport_lead' && a.transport !== 'need_ride') return false;
  if (a.help === 'other') return typeof a.helpOther === 'string' && a.helpOther.trim().length >= 1 && a.helpOther.trim().length <= HIKE_HELP_OTHER_MAX;
  return a.helpOther === null;
}
