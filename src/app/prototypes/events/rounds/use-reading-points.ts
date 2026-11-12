/**
 * @file use-reading-points.ts
 * @description The points a person marks during the reading part of a round: the Clarity Canvas the table discusses, read once
 * through the canvas page's own read (`canvasService.getCanvas`) and written through its own position write
 * (`canvasService.setPosition`, the `canvas_set_position` RPC). No positions table of its own (UAT 2026-11-11, item 5).
 *
 * A reader lists every point. The canvas owner lists every point they hold no position on yet (UAT 2026-11-12, supersedes the
 * changed-points-only rule of decision (d)).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTabVisible } from './use-round-canvas-reads';
import { saveInOrder } from '@/app/hooks/use-online-write-guard';
import { canvasService, type CanvasView } from '@/app/data/canvas-service';
import type { PositionType } from '@/app/types';
import { readingPoints, type PositionTap } from './mastermind-round-helpers';

export interface ReadingPoint {
  id: string;
  statement: string;
  /** The viewer's own stored position. */
  mine: PositionType | null;
  /** The Clarity Canvas owner's stored position; null = none taken. */
  owners: PositionType | null;
}

export interface ReadingPoints {
  points: ReadingPoint[];
  loaded: boolean;
  failed: boolean;
  /** Writes one tap through the canvas's own RPC; resolves false when it was refused. */
  mark: (pointId: string, tap: PositionTap) => Promise<boolean>;
  retry: () => void;
}

const positionOf = (view: CanvasView, pointId: string, userId: string): PositionType | null =>
  view.positions.get(pointId)?.find(p => p.userId === userId)?.position ?? null;


async function readList(args: { ownerId: string; name: string; viewerId: string; isOwner: boolean }): Promise<{ view: CanvasView; list: ReadingPoint[] }> {
  const view = await canvasService.getCanvas(args.ownerId, args.name, args.viewerId);
  const shown = readingPoints({
    isOwner: args.isOwner,
    points: view.points,
    previous: null,
    ownerPositionOf: id => positionOf(view, id, args.ownerId),
  });
  return {
    view,
    list: shown.map(p => ({ id: p.id, statement: p.statement, mine: positionOf(view, p.id, args.viewerId), owners: positionOf(view, p.id, args.ownerId) })),
  };
}

/** How long a loaded list counts as current when the tab comes back into view. */
const FRESH_MS = 30_000;

/** `enabled` is false outside the reading part, so nothing is read then. Hooks only: no early return above this. */
export function useReadingPoints(args: { enabled: boolean; ownerId: string | null; name: string | null; viewerId: string | null; isOwner: boolean; roundId?: string | null }): ReadingPoints {
  const { enabled, ownerId, name, viewerId, isOwner, roundId = null } = args;
  const [read, setRead] = useState<{ key: string; list: ReadingPoint[]; failed: boolean; at: number } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const readRef = useRef(read);
  readRef.current = read;
  const visible = useTabVisible();
  // A new round re-reads (the key carries it); within a round a loaded list is kept for FRESH_MS, so a version published meanwhile shows on the next return to view.
  const key = `${roundId}|${ownerId}|${name}|${viewerId}|${isOwner}`;
  // A hidden tab reads nothing: reading that begins in the background reads once on coming into view, and a list that already loaded is not re-read.
  const ready = enabled && visible && !!ownerId && !!name && !!viewerId;

  useEffect(() => {
    if (!ready || !ownerId || !name || !viewerId) return;
    if (readRef.current?.key === key && !readRef.current.failed && Date.now() - readRef.current.at < FRESH_MS) return;
    let live = true;
    readList({ ownerId, name, viewerId, isOwner })
      .then(r => { if (live) setRead({ key, list: r.list, failed: false, at: Date.now() }); })
      .catch(() => { if (live) setRead({ key, list: [], failed: true, at: Date.now() }); });
    return () => { live = false; };
  }, [ready, ownerId, name, viewerId, isOwner, key, attempt]);

  const mark = useCallback(async (pointId: string, tap: PositionTap): Promise<boolean> => {
    if (!ownerId || !name) return false;
    try {
      // Same queue as the point card's own save: taps on one point reach the server in the order they were made.
      await saveInOrder(`position:${pointId}`, () => canvasService.setPosition(ownerId, name, pointId, tap));
    } catch {
      return false;
    }
    setRead(prev => (prev ? { ...prev, list: prev.list.map(p => (p.id === pointId ? { ...p, mine: tap } : p)) } : prev));
    return true;
  }, [ownerId, name]);

  const retry = useCallback(() => { setRead(null); setAttempt(n => n + 1); }, []);
  const mine = read && read.key === key ? read : null;
  return { points: mine?.list ?? [], loaded: !!mine, failed: !!mine?.failed, mark, retry };
}
