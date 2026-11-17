/**
 * @file use-point-movement.ts
 * @description P1061: the point page's one movement read, shared by the point card's spread and the positions
 * block (each calls this hook; while a read is in flight, both get that same request). Keyed by point, viewer and
 * the counts on screen, so the viewer changing their own position (the counts change) reads again, and nothing is
 * kept once a read has settled: a later visit always asks the database. While a new read for the SAME point is in
 * flight, the rows already shown stay on screen instead of flashing to a skeleton. A failure is a failure, with a
 * retry: it is never shown as "nobody moved".
 */
import { useCallback, useEffect, useState } from 'react';
import { getPointMovement, type PointMovementRows } from '@/app/data/movement-service';

/** Reads in flight only: an entry is removed the moment its read settles, so it never serves old rows later. */
const inflight = new Map<string, Promise<PointMovementRows>>();

function readOnce(key: string, pointId: string): Promise<PointMovementRows> {
  const pending = inflight.get(key);
  if (pending) return pending;
  const read = getPointMovement(pointId);
  inflight.set(key, read);
  const settle = () => { if (inflight.get(key) === read) inflight.delete(key); };
  read.then(settle, settle);
  return read;
}

export interface PointMovementState {
  data: PointMovementRows | undefined;
  failed: boolean;
  retry: () => void;
}

type Held = { key: string; pointId: string; viewerId: string | undefined; data?: PointMovementRows; failed?: boolean };

/**
 * `version` changes whenever the positions on screen change (the counts, as JSON). `enabled` is false where the
 * viewer cannot read every holder's history: rows from part of the history would count only part of the people,
 * so nothing is read and nothing is shown.
 */
export function usePointMovement(pointId: string | undefined, viewerId: string | undefined, version: string, enabled = true): PointMovementState {
  const key = pointId && enabled ? `${pointId}|${viewerId ?? ''}|${version}` : null;
  const [state, setState] = useState<Held | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!key || !pointId) return;
    let cancelled = false;
    readOnce(key, pointId).then(
      data => { if (!cancelled) setState({ key, pointId, viewerId, data }); },
      () => { if (!cancelled) setState({ key, pointId, viewerId, failed: true }); },
    );
    return () => { cancelled = true; };
  }, [key, pointId, viewerId, attempt]);
  const retry = useCallback(() => {
    if (key) inflight.delete(key);
    setState(null);
    setAttempt(a => a + 1);
  }, [key]);
  if (!key) return { data: undefined, failed: false, retry };
  if (state && state.key === key) return { data: state.data, failed: state.failed === true, retry };
  // A new read of the same point for the same viewer (they just changed their position): keep the last rows
  // meanwhile. Rows read for another viewer are never shown.
  const held = state && state.pointId === pointId && state.viewerId === viewerId ? state.data : undefined;
  return { data: held, failed: false, retry };
}

/** Only where the viewer can read every holder's history today: a public point, or a non-public point's first validator. */
export function readsAllHistory(point: { visibility?: string | null; firstValidatorId?: string | null }, viewerId: string | undefined): boolean {
  // Fails closed: a point without its visibility (never from the database, where the column is NOT NULL) is not public.
  return point.visibility === 'public' || (!!viewerId && point.firstValidatorId === viewerId);
}
