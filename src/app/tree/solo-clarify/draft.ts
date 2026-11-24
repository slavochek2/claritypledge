/**
 * @file draft.ts
 * @description P1722 exploration: the draft's state (text, hand-added tags, visibility, the owner's position) and its tags.
 */
import { useState } from 'react';
import type { Position } from '@/app/components/shared/prototype-types';
import { splitTags, type Visibility } from './model';

export interface DraftState {
  text: string;
  tags: string[];
  visibility: Visibility;
  position: Position;
}

export function useDraft(text: string): [DraftState, (p: Partial<DraftState>) => void] {
  const [s, set] = useState<DraftState>({ text, tags: [], visibility: 'private', position: null });
  return [s, (p) => set(prev => ({ ...prev, ...p }))];
}

/** Tags typed as #words in the statement and tags added by hand, once each. */
export function allTags(d: DraftState): { statement: string; tags: string[] } {
  const { statement, tags } = splitTags(d.text);
  return { statement, tags: Array.from(new Set([...tags, ...d.tags])) };
}

