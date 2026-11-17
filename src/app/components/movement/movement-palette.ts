/**
 * @file movement-palette.ts
 * @description P1061: the three parts of a story's bar, the words for them and the colour of each. The bars and
 * their key read the same list.
 */
import type { Strength } from '@/lib/position-movement';

export const STRENGTH_PARTS: { id: Strength; word: string; bar: string }[] = [
  { id: 'switched', word: 'switched sides', bar: 'bg-blue-600 text-white' },
  { id: 'other', word: 'other change', bar: 'bg-blue-200 text-blue-950' },
  { id: 'same', word: 'same', bar: 'bg-gray-300 text-gray-900' },
];
