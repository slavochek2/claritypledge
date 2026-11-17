/**
 * @file story-detail-movement-context.ts
 * @description P1061: the story's movement, handed from the story card to its quoted points (their arrows chip)
 * without threading a prop through QuotedPoint. Undefined outside a story that carries a count: the profile, the
 * doc page and the landing page render the same card with no count, so no arrows.
 */
import { createContext } from 'react';
import type { StoryMovement } from '@/lib/position-movement';

export const StoryMovementContext = createContext<{ movement: StoryMovement; authorName: string } | undefined>(undefined);
