/**
 * @file use-message-reactions.ts
 * @description P1652: one message row's reactions. `enabled` is decided by the row from the message's ACTUAL chat (never the mirror, never a
 * private mirror row, never a deleted or unsent message); the server refuses the same cases. Nothing is read or watched while it is false.
 */
import { useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import type { ChatReaction } from '@/app/data/chat-reactions-service';
import { ChatContext } from './chat-state';
import { reactionsOf, setReaction, subscribeStore, watchReactions } from './reaction-store';

const NONE: readonly ChatReaction[] = [];

export interface MessageReactionsState {
  enabled: boolean;
  messageId: string | undefined;
  viewerId: string;
  reactions: readonly ChatReaction[];
  /** Where the emoji picker is open (viewport point), or null. */
  pickerAt: { x: number; y: number } | null;
  openPicker: (at: { x: number; y: number }) => void;
  closePicker: () => void;
  /** Add the viewer's reaction, or take it back when it is already theirs. */
  toggle: (emoji: string) => void;
}

export function useMessageReactions(messageId: string | undefined, enabled: boolean, viewerId: string): MessageReactionsState {
  const live = enabled && !!messageId;
  useEffect(() => (live && messageId ? watchReactions(messageId, viewerId) : undefined), [live, messageId, viewerId]);
  const reactions = useSyncExternalStore(
    subscribeStore,
    () => (live && messageId ? reactionsOf(messageId) : NONE),
    () => NONE,
  );
  // A reactor who wrote nothing shown has no profile loaded yet: ask for it (ensureAuthors skips the ones already known).
  const ensureAuthors = useContext(ChatContext)?.ensureAuthors;
  useEffect(() => {
    if (!ensureAuthors || reactions.length === 0) return;
    ensureAuthors([...new Set(reactions.map((r) => r.profileId))].filter((id) => id !== viewerId));
  }, [reactions, ensureAuthors, viewerId]);
  const [pickerAt, setPickerAt] = useState<{ x: number; y: number } | null>(null);
  const toggle = useCallback(
    (emoji: string) => {
      if (!live || !messageId) return;
      const on = !reactions.some((r) => r.profileId === viewerId && r.emoji === emoji);
      setReaction(messageId, emoji, on, viewerId).catch(() => toast.error('Could not update your reaction. Try again.'));
    },
    [live, messageId, reactions, viewerId],
  );
  const closePicker = useCallback(() => setPickerAt(null), []);
  return { enabled: live, messageId, viewerId, reactions, pickerAt, openPicker: setPickerAt, closePicker, toggle };
}
