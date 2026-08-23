import { stripAgentPrefix } from '@/lib/utils';
import { MachineChip } from './machine-chip';

interface AgentBylineProps {
  /** The profile name as stored, with or without the baked-in "Agent · " prefix. */
  name: string;
  className?: string;
}

/**
 * P1141 — `Reading of {Full Name}`, plus the machine chip.
 *
 * Production reads `Agent · {Name}` today with no chip; both halves of that are
 * a deliberate change, not drift. The full name is load-bearing beyond tone:
 * the pipeline reads auto-captions and has no reliable information about any
 * subject's pronouns, so a guess would misgender a real person under an account
 * bearing their own name. Full name sidesteps it entirely.
 */
export function AgentByline({ name, className = '' }: AgentBylineProps) {
  const fullName = stripAgentPrefix(name);
  return (
    // `flex` + `min-w-0` + `max-w-full`, not `inline-flex`: an inline-flex box
    // does not shrink below its content, so at 320px the name held its full
    // width and pushed the chip 19px past the card's right border — measured,
    // not inferred (chip right=308 vs card right=289). The chip is the element
    // carrying the authorship claim, so it is the worst one to lose off-screen.
    <span
      className={`flex min-w-0 max-w-full items-center gap-1.5 ${className}`}
      data-testid="agent-byline"
    >
      <span className="min-w-0 truncate" title={fullName}>
        Reading of {fullName}
      </span>
      <MachineChip className="shrink-0" />
    </span>
  );
}

export default AgentByline;
