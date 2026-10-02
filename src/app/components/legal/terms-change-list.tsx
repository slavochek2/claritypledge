import { useState } from 'react';
import { CURRENT_TERMS_VERSION } from '@/lib/constants';
import { TERMS_CHANGES } from '@/app/content/terms-changes';

/** The consent line both terms notices use, so the two variants never drift apart. */
export const TERMS_CONSENT_LINE = 'By continuing, you agree to the updated terms.';

// Links and the toggle are muted on purpose (founder): the only thing that should
// draw the eye is the accept button.
const MUTED_LINK = 'text-muted-foreground underline hover:text-foreground';

/** "We've updated our Terms and Privacy Policy", each document linked in place. */
export function TermsTitle() {
  return (
    <>
      We've updated our{' '}
      <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className={MUTED_LINK}>
        Terms
      </a>{' '}
      and{' '}
      <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className={MUTED_LINK}>
        Privacy Policy
      </a>
    </>
  );
}

/** One-sentence summary with an inline "Learn more"; the list opens on demand. */
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
          {open ? 'Show less' : 'Learn more'}
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
