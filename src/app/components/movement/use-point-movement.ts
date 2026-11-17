/**
 * @file use-point-movement.ts
 * @description P1061: the point page's one movement read, shared by the point card's spread and the positions
 * block (each calls this hook; one request answers both). Keyed by point, viewer and the counts on screen, so the
 * viewer changing their own position (the counts change) reads again. A failure is a failure, with a retry: it is
 * never shown as "nobody moved".
 */
import { useCallback, useEffect, useState } from 'react';
import { getPointMovement, type PointMovementRows } from '@/app/data/movement-service';

const inflight = new Map<string, Promise<PointMovementRows>>();
const KEPT = 20;

function readOnce(key: string, pointId: string): Promise<PointMovementRows> {
  const hit = inflight.get(key);
  if (hit) return hit;
  const read = getPointMovement(pointId);
  inflight.set(key, read);
  read.catch(() => inflight.delete(key)); // a failure is asked again, never kept
  if (inflight.size > KEPT) inflight.delete(inflight.keys().next().value as string);
  return read;
}

export interface PointMovementState {
  data: PointMovementRows | undefined;
  failed: boolean;
  retry: () => void;
}

/** `version` changes whenever the positions on screen change (the counts, as JSON). */
export function usePointMovement(pointId: string | undefined, viewerId: string | undefined, version: string): PointMovementState {
  const key = pointId ? `${pointId}|${viewerId ?? ''}|${version}` : null;
  const [state, setState] = useState<{ key: string; data?: PointMovementRows; failed?: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!key || !pointId) return;
    let cancelled = false;
    readOnce(key, pointId).then(
      data => { if (!cancelled) setState({ key, data }); },
      () => { if (!cancelled) setState({ key, failed: true }); },
    );
    return () => { cancelled = true; };
  }, [key, pointId, attempt]);
  const retry = useCallback(() => {
    if (key) inflight.delete(key);
    setState(null);
    setAttempt(a => a + 1);
  }, [key]);
  const current = state && state.key === key ? state : null;
  return { data: current?.data, failed: current?.failed === true, retry };
}

/** Only where the viewer can read every holder's history today: a public point, or a non-public point's first validator. */
export function readsAllHistory(point: { visibility?: string | null; firstValidatorId?: string | null }, viewerId: string | undefined): boolean {
  return (point.visibility ?? 'public') === 'public' || (!!viewerId && point.firstValidatorId === viewerId);
}
