/** P1631: one draft-count read for the whole Mirror conversation, given to every row under it. Keyed by the conversation at the call site so a switch starts fresh. */
import type { ReactNode } from 'react';
import { ClarifyCountsContext, useClarifyDraftCounts } from './use-clarify-draft-counts';

export function ClarifyCountsScope({ conversationId, enabled, children }: { conversationId: string; enabled: boolean; children: ReactNode }) {
  const counts = useClarifyDraftCounts(conversationId, enabled);
  return <ClarifyCountsContext.Provider value={counts}>{children}</ClarifyCountsContext.Provider>;
}
