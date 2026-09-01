import { Link } from 'react-router-dom';
import { stripAgentPrefix } from '@/lib/utils';

/**
 * P1141 RD-1 — the agent-story footer. Reworded by P1212 §2, founder decision 2026-09-04.
 *
 * Leads with the account, names the quote exception second, and the link label
 * is the third element the UI Contract called for. `{Full Name}` interpolates
 * the same value the byline uses.
 *
 * WHY THE WORDING CHANGED. §2 renamed the byline to `AGENT · on {Full Name}` on the
 * founder's evidence that "machine is not a word that people use". This sentence was left
 * on the old wording, which made it the ONLY place a reader still met "machine" and
 * "reading of" — a disclosure that no longer matched the label three lines above it.
 * Asked directly, the founder chose to match the byline: the account noun is `agent`, and
 * the connective is `on`, the same preposition that carries the account->subject relation
 * the byline needed.
 *
 * "machine-written" SURVIVES in the second sentence, deliberately and by the same decision.
 * It is not the account's noun there — it describes how the words were produced, which is
 * the one thing this sentence exists to say, and no shorter phrase says it as plainly.
 *
 * The link resolves to `/machines` (RD-2), a holding page so the URL is stable when the
 * real explainer content lands. The label now reads "agent accounts" while the route is
 * still `/machines`: renaming a live route is a redirect decision, not a copy change, and
 * is deliberately out of scope here. Pointing at `/about` was rejected — it resolves and
 * tells the reader nothing, which is a link that works and misleads.
 */
export function AgentStoryFooter({
  name,
  hasQuotes = true,
  className = '',
}: {
  name: string;
  /**
   * RD-1 fixes the footer's two sentences verbatim, and its second sentence
   * says "except the quotes". On a story with NO quotes that clause points at
   * nothing — blind review round 3, defect 1: on the one surface whose whole
   * job is telling a reader which words are machine-written, the disclosure
   * made a false claim about the page it was on, and a reader taking it at
   * face value would hunt for a quoted passage that does not exist.
   *
   * RD-1 was written assuming quotes are present. The exception clause is
   * therefore dropped when there are none, rather than published as a
   * falsehood. Flagged for the founder in assumptions.md — this is the one
   * deviation from a verbatim-specified string in the build.
   */
  hasQuotes?: boolean;
  className?: string;
}) {
  const fullName = stripAgentPrefix(name);
  return (
    <footer
      data-testid="agent-story-footer"
      className={`mt-6 border-t border-border pt-3 text-xs leading-relaxed text-gray-500 dark:border-gray-700 dark:text-gray-400 ${className}`}
    >
      <p>
        An agent account operated by ClarityPledge wrote this on {fullName}.{' '}
        {hasQuotes ? (
          <>
            Everything except the quotes is machine-written; the quotes come from the linked
            video.
          </>
        ) : (
          <>Nothing here is {fullName}'s own words.</>
        )}
      </p>
      <Link
        to="/machines"
        data-testid="agent-story-footer-link"
        className="mt-1 inline-block text-blue-500 hover:underline"
      >
        How agent accounts work →
      </Link>
    </footer>
  );
}

export default AgentStoryFooter;
