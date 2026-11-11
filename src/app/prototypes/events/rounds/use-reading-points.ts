/**
 * @file use-reading-points.ts
 * @description The points a person marks during the reading part of a round: the Clarity Canvas the table discusses, read once
 * through the canvas page's own read (`canvasService.getCanvas`) and written through its own position write
 * (`canvasService.setPosition`, the `canvas_set_position` RPC). No positions table of its own (UAT 2026-11-11, item 5).
 *
 * A reader lists every point. The canvas owner lists only the points that changed since their previous published version and that
 * they hold no position on (decision (d)), which needs the previous version's points: one more read, for owners only.
 */
import { useCallback, useEffect, useState } from 'react';
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

/** The published version before the one on screen (the newest published one when a draft is on screen). */
function previousVersionName(view: CanvasView): string | null {
  const published = view.versions.filter(v => !v.draft && v.seq !== null).sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0));
  const at = published.findIndex(v => v.name === view.version);
  return (at >= 0 ? published[at + 1] : published[0])?.name ?? null;
}

async function readList(args: { ownerId: string; name: string; viewerId: string; isOwner: boolean }): Promise<{ view: CanvasView; list: ReadingPoint[] }> {
  const view = await canvasService.getCanvas(args.ownerId, args.name, args.viewerId);
  const prevName = args.isOwner ? previousVersionName(view) : null;
  const previous = prevName ? (await canvasService.getCanvas(args.ownerId, args.name, args.viewerId, undefined, prevName)).points : null;
  const shown = readingPoints({
    isOwner: args.isOwner,
    points: view.points,
    previous,
    ownerPositionOf: id => positionOf(view, id, args.ownerId),
  });
  return {
    view,
    list: shown.map(p => ({ id: p.id, statement: p.statement, mine: positionOf(view, p.id, args.viewerId), owners: positionOf(view, p.id, args.ownerId) })),
  };
}

/** `enabled` is false outside the reading part, so nothing is read then. Hooks only: no early return above this. */
export function useReadingPoints(args: { enabled: boolean; ownerId: string | null; name: string | null; viewerId: string | null; isOwner: boolean }): ReadingPoints {
  const { enabled, ownerId, name, viewerId, isOwner } = args;
  const [read, setRead] = useState<{ key: string; list: ReadingPoint[]; failed: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${ownerId}|${name}|${viewerId}|${isOwner}`;
  const ready = enabled && !!ownerId && !!name && !!viewerId;

  useEffect(() => {
    if (!ready || !ownerId || !name || !viewerId) return;
    let live = true;
    readList({ ownerId, name, viewerId, isOwner })
      .then(r => { if (live) setRead({ key, list: r.list, failed: false }); })
      .catch(() => { if (live) setRead({ key, list: [], failed: true }); });
    return () => { live = false; };
  }, [ready, ownerId, name, viewerId, isOwner, key, attempt]);

  const mark = useCallback(async (pointId: string, tap: PositionTap): Promise<boolean> => {
    if (!ownerId || !name) return false;
    try {
      await canvasService.setPosition(ownerId, name, pointId, tap);
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
