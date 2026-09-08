import { useState } from 'react';
import { Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { stripAgentPrefix } from '@/lib/utils';

/**
 * P1259 change 2 + 3 — the agent disclosure, once on the profile instead of once per card.
 *
 * WHAT MOVED AND WHY. `AgentStoryFooter` rendered its two sentences under every agent story
 * on all six surfaces. Founder, 2026-09-07: "i would remove it from stories and put only
 * below desiption on profile of agents thats it..? or maybe hdide under icon? or shortern
 * and hide rest under informaiton icon in agents profiel". The third option is the one the
 * spec took, and its reasoning is worth keeping: the bare one-line version drops the
 * sentence that does the real work (WHICH parts are machine-written), and the full block
 * reproduces on the profile the wall of text being removed from the cards.
 *
 * THE ROUTE HERE IS THE BYLINE NAME. Every agent story card now removes the footer and
 * passes `onNameClick` to `AgentByline` instead, so the person's name navigates to this
 * page. Founder, deciding it: "if people are interested, who is this agent? They click and
 * they read it there. I guess that makes more sense. Otherwise, we have a lot of
 * redundancy, huge amount of text on every story." That makes THIS component the
 * destination of the only disclosure route in the product, which is why:
 *
 *   - The one-line summary is VISIBLE ON ARRIVAL, never behind the icon. A reader who came
 *     looking for it must not have to hunt (spec, Solution change 2).
 *   - The expanded text STANDS ALONE without the "How agent accounts work →" link. That
 *     link resolves to `/machines`, which is still a holding page (P1142 is unshipped —
 *     verified by path, spec Risks). Shipping a disclosure that depends on a page which
 *     does not yet explain anything would move the disclosure into a hole.
 *
 * The expanded sentences are `AgentStoryFooter`'s, founder-decided 2026-09-04, with one
 * word changed: "wrote this on {Name}" → "wrote these stories on {Name}", because on a
 * profile "this" has no antecedent. Nothing else about that string is reopened.
 */
export function AgentProfileDisclosure({
  name,
  className = '',
}: {
  /** The profile name as stored, with or without the baked-in "Agent · " prefix. */
  name: string;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const fullName = stripAgentPrefix(name);

  return (
    <div
      data-testid="agent-profile-disclosure"
      className={`mt-2 text-sm text-muted-foreground ${className}`}
    >
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 break-words">
        {/* FOUNDER DECISION 2026-09-08. The brief was one clause carrying "machine-written
            prose, real quotes"; three candidates were put and this one chosen. It leads
            with what the machine did and names whose words the quotes are, which is the
            half a reader is most likely to get wrong. */}
        <span data-testid="agent-disclosure-line">
          The prose here is machine-written. The quotes are {fullName}'s own words, from the
          linked video.
        </span>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls="agent-disclosure-detail"
          aria-label={expanded ? 'Hide the full agent-account disclosure' : 'What is an agent account?'}
          data-testid="agent-disclosure-toggle"
          /* 40px tall and 40px wide: the visual-QA checklist's touch-target floor. An icon
             this small is exactly the control that gets shipped as a 16px hit area. */
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center -my-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Info size={16} aria-hidden="true" />
        </button>
      </p>

      {expanded && (
        <div
          id="agent-disclosure-detail"
          data-testid="agent-disclosure-detail"
          className="mt-1 border-l-2 border-border pl-3 text-xs leading-relaxed"
        >
          <p>
            An agent account operated by ClarityPledge wrote these stories on {fullName}.{' '}
            Everything except the quotes is machine-written; the quotes come from the linked
            video.
          </p>
          {/* The label says "agent accounts" while the route is still `/machines`: renaming
              a live route is a redirect decision and is explicitly out of scope (spec,
              Non-Goals). The page's own visible copy is corrected in the same change, so a
              reader who follows this does not land on the word the byline stopped using. */}
          <Link
            to="/machines"
            data-testid="agent-disclosure-link"
            className="mt-1 inline-block text-blue-500 hover:underline"
          >
            How agent accounts work →
          </Link>
        </div>
      )}
    </div>
  );
}

export default AgentProfileDisclosure;
