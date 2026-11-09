/**
 * @file canvas-box-card-context.ts
 * @description P1621: on the owner's open draft a box's card is not a button: clicking it selects the box, and the card shows Edit and Open only while its box is
 * selected. The box tells the cards it holds through this context, so the page's one `renderCard` stays the same and a card drawn anywhere else (the side
 * panel's list, a reader's canvas, a published version) finds no provider and keeps today's whole-card button.
 */
import { createContext, useContext } from 'react';
import type { PointWithUserPosition } from '@/app/types';

export interface BoxCardValue {
  /** the box is selected: its cards show Edit and Open */
  selected: boolean;
  /** the agent is working on the draft: Edit is absent */
  runActive: boolean;
  onEdit: (point: PointWithUserPosition) => void;
  /** the box's tag: what a mention of one of its points names */
  tag: string;
}

export const BoxCardContext = createContext<BoxCardValue | null>(null);
export const useBoxCard = (): BoxCardValue | null => useContext(BoxCardContext);
