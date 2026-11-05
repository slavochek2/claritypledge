/**
 * @file canvas-new-card-copy.ts
 * @description P1621: the sentences the owner reads around adding a card by hand. Every one is shown to the owner, so each is marked until the founder approves it.
 */
import { CANVAS_BOX_CARD_LIMIT } from '@/lib/canvas-boxes';

// [FOUNDER DECISION: pending P1621 review] wording of the full-box message.
export const FULL_BOX_TEXT = `This box is full. It holds ${CANVAS_BOX_CARD_LIMIT} cards.`;
// [FOUNDER DECISION: pending P1621 review] wording of the same-words refusal.
export const DUPLICATE_POINT_TEXT = 'This box already has that point.';
// [FOUNDER DECISION: pending P1621 review] the quiet label on a box that holds typed text nobody saved yet.
export const UNSAVED_TEXT_LABEL = 'Unsaved text';
