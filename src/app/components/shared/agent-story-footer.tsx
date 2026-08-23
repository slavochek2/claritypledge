import { Link } from 'react-router-dom';
import { stripAgentPrefix } from '@/lib/utils';

/**
 * P1141 RD-1 — the agent-story footer, verbatim.
 *
 * Leads with the machine, names the quote exception second, and the link label
 * is the third element the UI Contract called for. `{Full Name}` interpolates
 * the same value the byline uses.
 *
 * The link resolves to `/machines` (RD-2), a holding page this spec adds so the
 * URL is stable when the real explainer content lands. Pointing at `/about` was
 * rejected: it resolves and tells the reader nothing about machine accounts,
 * which is a link that works and misleads.
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
      className={`mt-6 border-t border-gray-200 pt-3 text-xs leading-relaxed text-gray-500 dark:border-gray-700 dark:text-gray-400 ${className}`}
    >
      <p>
        A machine account operated by ClarityPledge wrote this reading of {fullName}.{' '}
        {hasQuotes ? (
          <>
            Nothing here is {fullName}'s own words except the quotes, which come from the linked
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
        How machine accounts work →
      </Link>
    </footer>
  );
}

export default AgentStoryFooter;
