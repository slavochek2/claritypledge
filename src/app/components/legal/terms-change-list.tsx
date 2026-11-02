import { useState } from 'react';
import { CURRENT_TERMS_VERSION } from '@/lib/constants';
import { TERMS_CHANGES, type TermsChangeSummary } from '@/app/content/terms-changes';

/** The consent sentence for screen readers; TermsFinePrint is its visible form with links. */
export const TERMS_CONSENT_LINE = 'Our Terms and Privacy Policy are updated. To continue, you need to agree to them.';

// Links and the toggle are muted on purpose (founder): the only thing that should
// draw the eye is the accept button.
const MUTED_LINK = 'text-muted-foreground underline hover:text-foreground';

/** Opens the notice with what is new, not with the fact that documents changed (P1596). */
export function TermsTitle() {
  return <>{TERMS_CHANGES[CURRENT_TERMS_VERSION]?.title ?? "We've updated our Terms and Privacy Policy"}</>;
}

/** The legal line under every notice: each document linked, then the agreement. */
export function TermsFinePrint({ required = false }: { required?: boolean }) {
  return (
    <>
      Our{' '}
      <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className={MUTED_LINK}>
        Terms
      </a>{' '}
      and{' '}
      <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className={MUTED_LINK}>
        Privacy Policy
      </a>{' '}
      are updated. {required ? 'To continue, you need to agree to them.' : 'By continuing, you agree to them.'}
    </>
  );
}

/** Earlier changes that needed consent and that this person never saw. */
export function TermsMissedChanges({ missed }: { missed: TermsChangeSummary[] }) {
  if (missed.length === 0) return null;
  return (
    <div className="space-y-2 text-sm" data-testid="terms-missed">
      {/* What forced this popup stays readable without opening anything (terms-changes.ts); the detail is one tap away. */}
      {missed.map((entry) => (
        <details key={entry.title}>
          <summary className="cursor-pointer">{entry.headline}</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {entry.highlights.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}

/** One-sentence summary with an inline "Show more"; the list opens on demand. */
export function TermsChangeList() {
  const [open, setOpen] = useState(false);
  const changes = TERMS_CHANGES[CURRENT_TERMS_VERSION];
  if (!changes) return null;
  return (
    <div className="space-y-2 text-sm">
      <p>
        {changes.headline}{' '}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={`-my-2 inline-block rounded py-2 ${MUTED_LINK} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      </p>
      {open && (
        <ul className="list-disc space-y-1 pl-5">
          {changes.highlights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
