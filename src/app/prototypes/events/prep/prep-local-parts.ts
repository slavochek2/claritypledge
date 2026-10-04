/**
 * @file prep-local-parts.ts
 * @description P1402 — once-per-person preparation parts completed on /prepare by a signed-out
 * visitor. Kept in this browser, then written to person_prep_parts on the first read after sign-in
 * (the standalone page and every event preparation call `syncLocalPrepParts`), so a part done on
 * /prepare is never asked again in an event's preparation. One direction only: nothing on the
 * account is ever lowered by a sync, and a part already completed on the account is left alone.
 *
 * Same storage contract as /meet and anonymous positions (useAnonPosition.ts): any storage failure
 * is a no-op — the visitor can still watch everything, the progress just isn't remembered.
 */
import { markPrepPart, type PrepPart, type PrepPartRow } from '@/app/data/event-prep-service';
import { isPartDone, PART_VERSIONS } from './prep-plan';

const STORAGE_KEY = 'cp-prep-parts';

export interface LocalPart {
  contentVersion: number;
  completedAt: string;
}
export type LocalParts = Partial<Record<PrepPart, LocalPart>>;

const isPart = (k: string): k is PrepPart => k in PART_VERSIONS;

export function readLocalParts(): LocalParts {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (typeof parsed !== 'object' || parsed === null) return {};
    const out: LocalParts = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const row = v as Partial<LocalPart> | null;
      // Only a real date and a version that exists: a forged 999 would mark future versions done.
      if (
        isPart(k) && row && typeof row.contentVersion === 'number' && typeof row.completedAt === 'string'
        && Number.isInteger(row.contentVersion) && row.contentVersion >= 1 && row.contentVersion <= PART_VERSIONS[k]
        && !Number.isNaN(Date.parse(row.completedAt))
      ) {
        out[k] = { contentVersion: row.contentVersion, completedAt: row.completedAt };
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeLocalParts(parts: LocalParts): void {
  try {
    if (Object.keys(parts).length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(parts));
  } catch {
    /* storage unavailable: progress lasts until reload */
  }
}

/** Records a part completed (at its current version) in this browser. */
export function markLocalPart(part: PrepPart, at: string = new Date().toISOString()): LocalParts {
  const parts = { ...readLocalParts(), [part]: { contentVersion: PART_VERSIONS[part], completedAt: at } };
  writeLocalParts(parts);
  return parts;
}

/** The local parts as the rows `isPartDone` reads, so signed-out and signed-in share one rule. */
export function localPartRows(parts: LocalParts): PrepPartRow[] {
  return (Object.entries(parts) as [PrepPart, LocalPart][]).map(([part, p]) => ({
    part,
    contentVersion: p.contentVersion,
    completedAt: p.completedAt,
    skippedAt: null,
  }));
}

/**
 * Writes this browser's completed parts to the signed-in person's account, then forgets them.
 * Returns the parts it wrote. A part the account already has completed (at the current version)
 * is not touched — its own date is kept. A failed write keeps that part local for the next try.
 */
export async function syncLocalPrepParts(
  profileId: string,
  accountRows: PrepPartRow[],
  /** An event preparation already under way: never date a part before it started — prep-plan's
   *  partInPlan would drop that step mid-flow ("Step 2 of 6" turning into "Step 1 of 5"). */
  notBefore: string | null = null,
): Promise<PrepPart[]> {
  const local = readLocalParts();
  const remaining: LocalParts = { ...local };
  const written: PrepPart[] = [];
  for (const [part, p] of Object.entries(local) as [PrepPart, LocalPart][]) {
    // An older local version than the current content counts for nothing (a re-shown part).
    if (p.contentVersion < PART_VERSIONS[part] || isPartDone(accountRows, part)) {
      delete remaining[part];
      continue;
    }
    try {
      const at = notBefore && Date.parse(p.completedAt) < Date.parse(notBefore) ? new Date().toISOString() : p.completedAt;
      await markPrepPart(profileId, part, p.contentVersion, 'completed', at);
      written.push(part);
      delete remaining[part];
    } catch {
      /* stays local; retried on the next read */
    }
  }
  writeLocalParts(remaining);
  return written;
}
