/**
 * @file prototype-types.ts
 * @description Prototype-specific type definitions used by extracted components.
 *
 * These types (Story with `.text`, Point with `.text`) originated in the prototype
 * layer. Production code converts its own shapes to these before passing props
 * to the extracted components. Changing `.text` → `.content` would require
 * touching dozens of files, so we keep the conversion pattern instead.
 *
 * Extracted from prototypes/shared/types.ts during P507.
 */

import type { PositionType } from '@/app/types';

// Re-export PositionType for convenience
export type { PositionType };

/** Position = PositionType | null (user may not have taken a position) */
export type Position = PositionType | null;

/** A single position entry with timestamp */
export interface PositionEntry {
  position: PositionType;
  timestamp: string;
}

/** Visibility levels for ideas/stories */
export type IdeaVisibility = 'public' | 'private';

/**
 * Prototype Story shape — uses `.text` (not `.content`).
 * Production code converts to this before passing to extracted components.
 */
export interface Story {
  id: string;
  text: string;
  authorId: string;
  createdAt: string;
  visibility: IdeaVisibility;
  eventId?: string;
  linkedPointIds: string[];
  understoodCount: number;
  crossDisagreementCount?: number;
  imageUrl?: string;
  /**
   * P1212 §4: the story's video and its supporting quotes. Optional because most callers
   * convert from a production row that may carry neither — but a surface that renders the
   * story's prose without them shows the argument and withholds its evidence, which is what
   * §1 made visible when it stripped the quote bodies out of `content`.
   */
  videoUrl?: string;
  videoQuotes?: unknown;
}

/**
 * Prototype Point shape — uses `.text` (not `.content`).
 * Production code converts to this before passing to extracted components.
 */
export interface Point {
  id: string;
  text: string;
  createdAt: string;
  positions: Record<string, PositionEntry | null>;
  linkedStoryIds: string[];
  visibility: IdeaVisibility;
}
