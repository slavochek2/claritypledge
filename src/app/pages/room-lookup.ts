/** @file room-lookup.ts @description One getRoomByCode request per code, shared by everything that asks about a /transcribe room. */
import { getRoomByCode } from '@/app/data/transcribe-service';

const lookups = new Map<string, ReturnType<typeof getRoomByCode>>();

/** A failed or empty lookup is dropped so a retry can succeed. */
export function roomOf(code: string): ReturnType<typeof getRoomByCode> {
  let p = lookups.get(code);
  if (!p) {
    p = getRoomByCode(code);
    lookups.set(code, p);
    void p.then((room) => { if (!room) lookups.delete(code); }, () => { lookups.delete(code); });
  }
  return p;
}
