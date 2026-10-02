import { CURRENT_TERMS_VERSION } from '@/lib/constants';
import { TERMS_CHANGES } from '@/app/content/terms-changes';

/** "What changed" for the current terms version: highlights, then "See all changes". */
export function TermsChangeList() {
  const changes = TERMS_CHANGES[CURRENT_TERMS_VERSION];
  if (!changes) return null;
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">What changed</p>
      <ul className="list-disc space-y-1 pl-5">
        {changes.highlights.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {changes.details.length > 0 && (
        <details>
          <summary className="cursor-pointer text-blue-600 hover:underline">See all changes</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {changes.details.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function LegalDocLinks() {
  return (
    <div className="flex gap-4 text-sm">
      <a href="/terms-of-service" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
        View Terms
      </a>
      <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
        View Privacy Policy
      </a>
    </div>
  );
}
