/**
 * @file use-owner-identity.ts
 * @description The canvas owner as their profile shows them on the open point (D5): an agent or not decides the ear count (an
 * agent holds no reputation, P1104), read once per canvas. No count is shown rather than a wrong one.
 */
import { useEffect, useState } from 'react';
import { useAgentAccountIds } from '@/app/contexts/agent-accounts-context';
import { calibrationService } from '@/app/data/calibration-service';

export function useOwnerIdentity(ownerId: string | null): { ownerIsAgent: boolean; identityPending: boolean; ownerEar: { ownerId: string; ear: number } | null } {
  const { isAgentAccountId, isLoading: identityPending } = useAgentAccountIds();
  const ownerIsAgent = !!ownerId && isAgentAccountId(ownerId);
  const [ownerEar, setOwnerEar] = useState<{ ownerId: string; ear: number } | null>(null);
  useEffect(() => {
    if (!ownerId || identityPending || ownerIsAgent) return;
    let live = true;
    calibrationService.getEarsCount(ownerId)
      .then(ear => { if (live) setOwnerEar({ ownerId, ear }); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [ownerId, identityPending, ownerIsAgent]);
  return { ownerIsAgent, identityPending, ownerEar };
}
