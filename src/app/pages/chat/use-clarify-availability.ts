/**
 * P1631: whether Clarify drafting is on for this project, asked of the clarify-draft function (the canvas hook's twin: one answer per session, null means
 * "not known yet", never "off", a failed check is asked again). Every Clarify entry (message menu and hover bar, chat-row item, New point) shows only on exactly true.
 */
import type { ChatSummary } from '@/app/data/chat-service';
import { getClarifyAvailability } from '@/app/data/clarify-service';
import { useAvailabilityProbe } from './use-availability-probe';

let settled: boolean | null = null;
let inflight: Promise<boolean | null> | null = null;

function ask(): Promise<boolean | null> {
  if (settled !== null) return Promise.resolve(settled);
  inflight ??= getClarifyAvailability().then((on) => {
    inflight = null;
    if (on !== null) settled = on;
    return on;
  });
  return inflight;
}

/** For tests: forget the session's answer. */
export function resetClarifyAvailability(): void {
  settled = null;
  inflight = null;
}

/** For tests and the P955 gate fixtures: pretend the server answered. */
export function seedClarifyAvailability(on: boolean | null): void {
  settled = on;
  inflight = null;
}

/** True only when the server said drafting is on. `active` false: nothing is asked. */
export function useClarifyDraftAvailability(active = true): boolean | null {
  return useAvailabilityProbe(active, settled, ask);
}

/** The one gate of every Clarify entry: not the Mirror itself, and drafting is known to be on. */
export function useClarifyAvailable(summary: Pick<ChatSummary, 'kind'>): boolean {
  const ordinary = summary.kind !== 'mirror';
  return useClarifyDraftAvailability(ordinary) === true;
}
