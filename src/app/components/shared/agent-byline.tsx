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
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`} data-testid="agent-byline">
      <span className="truncate" title={fullName}>
        Reading of {fullName}
      </span>
      <MachineChip />
    </span>
  );
}

export default AgentByline;
