/**
 * @file point-story-arrows-context.ts
 * @description P1061: on the point page's Positions view, an opened "1 story" pill shows that story's arrows on
 * this point beside its verified badge. The block provides how to find them; the story card (shared with every
 * other surface) reads it, and everywhere else the context is empty and nothing changes.
 */
import { createContext } from 'react';
import type { Arrows } from '@/lib/position-movement';

export const PointStoryArrowsContext = createContext<((storyId: string) => { arrows: Arrows; authorName: string } | null) | null>(null);
