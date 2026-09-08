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
 * REWRITTEN 2026-09-08 on the founder's instruction: *"It's weird to say prose... I think we
 * need to simplify for a 10-year-old."* The previous wording ("The prose here is
 * machine-written") failed on the one word carrying the whole claim — "prose" is not a word a
 * reader outside publishing reaches for, and a disclosure nobody parses discloses nothing.
 *
 * What the new wording had to keep, and does: WHICH parts are the machine's (the stories) and
 * WHICH are the person's (anything in quotation marks). That split is the entire point; a
 * shorter line that dropped it would read better and say less. The expanded text adds the two
 * things a reader most needs and the old text never said outright — that this is NOT the
 * person's account, and that they can go and watch the person say the quoted words.
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
      {/* A NORMAL INLINE PARAGRAPH, not a flex row — corrected after looking at the render.
          As `flex flex-wrap`, the sentence was ONE flex item, so it could not wrap around the
          icon: the icon was pushed onto a line of its own and read as an orphaned control
          rather than as part of the sentence (visual-QA checklist, "Sibling weight"). Inline
          flow lets the icon sit immediately after the last word at every width. */}
      <p className="break-words">
        {/* FOUNDER DECISION 2026-09-08. The brief was one clause carrying "machine-written
            prose, real quotes"; three candidates were put and this one chosen. It leads
            with what the machine did and names whose words the quotes are, which is the
            half a reader is most likely to get wrong. */}
        <span data-testid="agent-disclosure-line">
          The stories on this page are written by a machine. The words in quotes are{' '}
          {fullName}'s own.
        </span>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-controls="agent-disclosure-detail"
          aria-label={expanded ? 'Hide the full agent-account disclosure' : 'What is an agent account?'}
          data-testid="agent-disclosure-toggle"
          /* 40x40 is the visual-QA checklist's touch-target floor — a 16px icon is exactly
             the control that ships with a 16px hit area. `-my-2` + `align-middle` keep a
             control that tall from stretching the line box it now sits inside. */
          className="ml-1 inline-flex h-10 w-10 shrink-0 -my-2 items-center justify-center align-middle rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
            This account is run by ClarityPledge. It is not {fullName}, and {fullName} has no
            part in it. A machine wrote every story here. The words inside quotation marks are
            not the machine's — each one comes from the video that story links to, so you can
            watch {fullName} say it.
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
