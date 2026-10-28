/**
 * @file section-wait.tsx
 * @description P1586: the deadline for a section wait. Renders the section's skeleton (children) until
 * the deadline, then a quiet readable line with a Retry. A section wait that never ends must become a
 * readable state, not a skeleton that hangs forever.
 *
 * The caller renders this only while its read is pending, so a late answer for the current view
 * replaces the fallback by the caller leaving the loading branch (this unmounts, its timer clears), and
 * a re-mount starts a fresh deadline. onRetry must re-run that section's read. A caller whose read
 * rejects passes `failed`, so the fallback shows at once; it clears `failed` when it re-runs the read.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./button";

/** Shorter than the page loader's 15s: the page around the section is already drawn and usable. */
const SECTION_WAIT_DEADLINE_MS = 10_000;

interface SectionWaitProps {
  /** The section's skeleton, shown until the deadline. */
  children: ReactNode;
  /** Re-runs the section's read. */
  onRetry: () => void;
  /** The read rejected: show the fallback at once instead of waiting out the deadline. */
  failed?: boolean;
}

export function SectionWait({ children, onRetry, failed = false }: SectionWaitProps) {
  const [slow, setSlow] = useState(false);
  // A counter, not the flag, restarts the timer: Retry sets slow back to false in the same batch.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), SECTION_WAIT_DEADLINE_MS);
    return () => clearTimeout(t);
  }, [attempt]);

  if (!slow && !failed) return <>{children}</>;

  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      {/* [FOUNDER DECISION: section slow-load copy is a placeholder.] */}
      <p className="text-sm text-muted-foreground">This is taking longer than usual.</p>
      {/* P1586 visual QA: the same 40px outline button as the page notice and the events-list Retry. */}
      <Button
        variant="outline"
        className="min-h-10"
        onClick={() => {
          setSlow(false);
          setAttempt((n) => n + 1);
          onRetry();
        }}
      >
        Retry
      </Button>
    </div>
  );
}
