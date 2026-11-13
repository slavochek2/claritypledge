/**
 * P1631: the order of a Clarify thread. The owner's messages and the Mirror's drafts are one conversation in time order: a draft is drawn right
 * after the last message that is not newer than it (the root, for the first draft). Pure, so the rule is testable without a screen.
 */
import type { ClarifyDraft } from '@/app/data/clarify-service';

export interface TimedMessage { id: string; createdAt: string }

const at = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** The id of the message each draft follows, grouped by that id; drafts keep their own order within a place. */
export function draftsByMessage(messages: TimedMessage[], drafts: ClarifyDraft[]): Map<string, ClarifyDraft[]> {
  const out = new Map<string, ClarifyDraft[]>();
  const ordered = [...messages].sort((a, b) => at(a.createdAt) - at(b.createdAt));
  const first = ordered[0];
  if (!first) return out;
  for (const d of [...drafts].sort((a, b) => at(a.createdAt) - at(b.createdAt))) {
    let place = first.id;
    for (const m of ordered) if (at(m.createdAt) <= at(d.createdAt)) place = m.id;
    out.set(place, [...(out.get(place) ?? []), d]);
  }
  return out;
}

/**
 * A card is an earlier version when a newer card that was made from it exists: that card is DONE (a failed or running refine changes nothing) and the card it names is still in
 * the thread (the column has no foreign key, so a target that was deleted names nothing).
 */
export function earlierDraftIds(drafts: ClarifyDraft[]): Set<string> {
  const present = new Set(drafts.map((d) => d.id));
  const out = new Set<string>();
  for (const d of drafts) if (d.state === 'done' && d.refineTargetId && present.has(d.refineTargetId)) out.add(d.refineTargetId);
  return out;
}

/** "Another point" sits under the latest card; with every draft gone it is the way to start again. */
export function mayAddAnother(drafts: ClarifyDraft[]): boolean {
  const last = drafts[drafts.length - 1];
  return !last || last.state === 'done';
}

/**
 * The place the thread's last row (Another point, Publish) is drawn: the message the newest draft follows, else the newest message, else the root.
 * Moved out of useClarifyParts unchanged.
 */
export function lastDraftPlace(places: TimedMessage[], placed: Map<string, ClarifyDraft[]>, drafts: ClarifyDraft[], rootId: string): string {
  const lastDraft = drafts[drafts.length - 1];
  return (lastDraft && [...placed.entries()].find(([, ds]) => ds.includes(lastDraft))?.[0]) ?? [...places].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).at(-1)?.id ?? rootId;
}
