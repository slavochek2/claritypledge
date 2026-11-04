/**
 * @file transcribe-slice-destination.ts
 * @description P1592: where the server stored the line a slice produced, as `transcribe-slice`
 * reports it in its success body. Split out of transcribe-service.ts.
 *
 * `label` is a place name ("Round 2 · Anna & Ben", or the event's title), null for kind 'none'.
 */

import { withDeadline } from '@/lib/with-deadline';

export interface SliceDestination {
  kind: 'round' | 'channel' | 'none';
  label: string | null;
}

/** Reads the additive `destination` field defensively: anything malformed is "none told". */
export function parseSliceDestination(body: unknown): SliceDestination | null {
  const d = (body as { destination?: unknown } | null | undefined)?.destination;
  if (!d || typeof d !== 'object') return null;
  const { kind, label } = d as { kind?: unknown; label?: unknown };
  if (kind !== 'round' && kind !== 'channel' && kind !== 'none') return null;
  return { kind, label: typeof label === 'string' && label.trim() ? label : null };
}

/** P1604 rule 8: where the 3-hour roll moved this person: the room that carries on, and their seat in it. */
export interface MovedTo {
  roomId: string;
  roomCode: string;
  memberId: string;
}

/** Reads a `movedTo` defensively: anything malformed is "not moved". */
export function parseMovedTo(v: unknown): MovedTo | null {
  if (!v || typeof v !== 'object') return null;
  const { roomId, roomCode, memberId } = v as Record<string, unknown>;
  return typeof roomId === 'string' && typeof roomCode === 'string' && typeof memberId === 'string'
    ? { roomId, roomCode, memberId }
    : null;
}

/** A non-2xx answer from transcribe-slice. The message keeps the `transcribe-slice <status>: <error>` shape the
 *  hard-stop detection reads; `movedTo` is set when the roll seated the caller in the next room (410 only). */
export class SliceRefusedError extends Error {
  constructor(message: string, readonly status: number, readonly movedTo: MovedTo | null) {
    super(message);
    this.name = 'SliceRefusedError';
  }
}

/**
 * Turns the edge function's answer into a result. A non-2xx answer throws the same
 * `transcribe-slice <status>: <error>` message the hard-stop detection reads. A 2xx answer yields
 * its body for the destination only: a body that cannot be read in time is not a failed slice
 * (the line is already stored), and the deadline keeps a body that streams forever from holding
 * the serial sender's chain.
 */
export async function settleSliceResponse(response: Response, timeoutMs: number): Promise<unknown> {
  if (!response.ok) {
    const detail = await withDeadline(response.json().catch(() => ({})), timeoutMs, 'transcribe-slice error body').catch(() => ({}));
    throw new SliceRefusedError(
      `transcribe-slice ${response.status}: ${(detail as { error?: string }).error ?? 'unknown'}`,
      response.status,
      parseMovedTo((detail as { movedTo?: unknown }).movedTo),
    );
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); });
  const read = Promise.resolve(response.json?.()).catch(() => null);
  return Promise.race([read, deadline]).finally(() => clearTimeout(timer));
}
