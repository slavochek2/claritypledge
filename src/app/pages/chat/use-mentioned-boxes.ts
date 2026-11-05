/**
 * @file use-mentioned-boxes.ts
 * @description P1621: the boxes mentioned in chat now (held for the composer, or in its value), so a box can read "Mentioned" while its pill is there. An empty set with no bus.
 */
import { useContext, useSyncExternalStore } from 'react';
import { ComposerTagContext } from './composer-tag-bus';

const NONE: ReadonlySet<string> = new Set();
const noUnsubscribe = () => () => undefined;

export function useMentionedBoxes(): ReadonlySet<string> {
  const bus = useContext(ComposerTagContext);
  return useSyncExternalStore(bus ? bus.subscribe : noUnsubscribe, bus ? bus.mentioned : () => NONE);
}
