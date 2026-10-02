import { ChevronRight } from 'lucide-react';
import { CURRENT_TERMS_VERSION } from '@/lib/constants';
import { TERMS_CHANGES } from '@/app/content/terms-changes';

/** The consent line both terms notices use, so the two variants never drift apart. */
export const TERMS_CONSENT_LINE = 'By continuing, you agree to the updated Terms and Privacy Policy.';

/** One-sentence summary of the current terms version; the list opens on demand. */
export function TermsChangeList() {
  const changes = TERMS_CHANGES[CURRENT_TERMS_VERSION];
  if (!changes) return null;
  return (
    <div className="space-y-1 text-sm">
      <p>{changes.headline}</p>
      <details className="group">
        <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1 rounded text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" aria-hidden />
          What's new
        </summary>
        <ul className="list-disc space-y-1 pb-1 pl-5">
          {changes.highlights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export function LegalDocLinks() {
  return (
    <div className="flex gap-6 text-sm">
      <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center text-blue-600 hover:underline">
        Terms
      </a>
      <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center text-blue-600 hover:underline">
        Privacy Policy
      </a>
    </div>
  );
}
