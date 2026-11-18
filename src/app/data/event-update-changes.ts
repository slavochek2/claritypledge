/**
 * @file event-update-changes.ts
 * @description P1675 UAT round 1: an Edit that changes nothing an attendee was told sends no "event updated" email. The Edit form
 * resends every field (title, time, place) unchanged, so "was a non-silent key in the payload" is not "did something change".
 * The service reads the current values of the non-silent keys it is about to write, then asks here whether any really changed.
 * Lives here so events-service-real.ts (over the size limit) does not grow.
 */
import { supabase } from '@/lib/supabase';
import { eventUpdateColumns } from './event-write-columns';
import type { UpdateEventInput } from './events-service.interface';

/** Columns whose change tells attendees nothing (banner, preparation and canvas settings, hidden flag, hike questions). */
export const SILENT_KEYS = ['banner_url', 'preparation_enabled', 'statement_tag', 'is_hidden', 'canvas_timing', 'hike_registration'];

const loudKeys = (updateData: Record<string, unknown>): string[] => Object.keys(updateData).filter((k) => !SILENT_KEYS.includes(k));

/**
 * The current values of exactly the non-silent columns about to be written, read before the write.
 * Null when there is nothing to read or the read failed (the caller then sends, as before).
 */
export async function readLoudValuesBefore(eventId: string, updateData: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const keys = loudKeys(updateData);
  if (keys.length === 0) return null;
  try {
    const { data, error } = await supabase.from('events').select(keys.join(',')).eq('id', eventId).maybeSingle();
    if (error || !data) return null;
    return data as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The columns an edit will write, with the current told values read before the write (UAT R1). */
export async function columnsWithValuesBefore(eventId: string, data: UpdateEventInput) {
  const updateData = eventUpdateColumns(data);
  return { updateData, before: await readLoudValuesBefore(eventId, updateData) };
}

const isBlank = (v: unknown): boolean => v === null || v === undefined || v === '';

function sameValue(key: string, a: unknown, b: unknown): boolean {
  if (isBlank(a) || isBlank(b)) return isBlank(a) && isBlank(b);
  if (key === 'datetime') return new Date(a as string).getTime() === new Date(b as string).getTime();
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b);
  return a === b;
}

/** Whether the write should email attendees: some non-silent value really changed (or could not be compared). */
export function updateNeedsEmail(updateData: Record<string, unknown>, before: Record<string, unknown> | null): boolean {
  const keys = loudKeys(updateData);
  if (keys.length === 0) return false;
  if (!before) return true;
  return keys.some((k) => !sameValue(k, before[k], updateData[k]));
}
