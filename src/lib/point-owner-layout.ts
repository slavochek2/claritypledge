/**
 * @file point-owner-layout.ts
 * @description P1508 D5: which owner header a point card shows (point-owner-header.tsx) — the
 * profile's rule, shared with the canvas's open point card.
 */
import type { PositionType } from '@/app/types';

/** 'quote': owner row above a quoted box; 'own': the own-card header inside the card. */
export type PointOwnerLayout = 'quote' | 'own';

export function pointOwnerLayout({ isOwnView, position, rowWithoutPosition = false }: {
  isOwnView: boolean;
  position?: PositionType | null;
  rowWithoutPosition?: boolean;
}): PointOwnerLayout {
  return !isOwnView && (position || rowWithoutPosition) ? 'quote' : 'own';
}
