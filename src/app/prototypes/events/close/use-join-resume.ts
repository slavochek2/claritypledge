/**
 * P1542 round 7g: a reopened group terms step (?join=1, or the step restored from sessionStorage) decides once the page
 * is ready AND the membership read has settled — in either order, or in the same commit. A member or an unknown (a
 * failed read) goes to the thank-you; a definite non-member stays on the terms; while the read is out it waits (the
 * page shows its loader). The decision is re-evaluated on every input, not latched in the commit where `ready` flips,
 * so a membership that settled BEFORE ready is not missed.
 */
import { useEffect, useRef } from 'react';

export function useJoinResume(opts: {
  ready: boolean;
  /** The step the page opened on (or is on) is the group terms. */
  atJoin: boolean;
  /** The terms can be shown at all: the group loaded and the learning is done. */
  showable: boolean;
  isMember: boolean | null | undefined;
  leave: () => void;
}): void {
  const { ready, atJoin, showable, isMember, leave } = opts;
  const decided = useRef(false);
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => {
    if (!ready || decided.current) return;
    // Opened on another step: nothing to resume (a later move to the terms comes from a definite non-member).
    if (!atJoin) { decided.current = true; return; }
    if (!showable) { decided.current = true; leaveRef.current(); return; }
    if (isMember === undefined) return;
    decided.current = true;
    if (isMember !== false) leaveRef.current();
  }, [ready, atJoin, showable, isMember]);
}
