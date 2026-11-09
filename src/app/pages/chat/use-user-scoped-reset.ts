/**
 * @file use-user-scoped-reset.ts
 * @description What belongs to one signed-in person is dropped when the person changes: other people's drafts always, and on
 * sign-out (P1652) the previous person's reactions and link cards.
 */
import { useEffect } from 'react';
import { clearDraftsExcept } from './chat-hooks';
import { clearLinkCardCache } from './link-card-cache';
import { clearReactionStore } from './reaction-store';

export function useUserScopedReset(userId: string | null) {
  useEffect(() => {
    clearDraftsExcept(userId);
    if (userId === null) {
      clearReactionStore();
      clearLinkCardCache();
    }
  }, [userId]);
}
