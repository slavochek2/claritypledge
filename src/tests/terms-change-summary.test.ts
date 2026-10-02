import { describe, it, expect } from 'vitest';
import { CURRENT_TERMS_VERSION } from '@/lib/constants';
import { TERMS_CHANGES } from '@/app/content/terms-changes';

// The re-acceptance popup must say what changed. A version bump without a
// summary would show returning users two long documents and nothing else.
describe('terms change summary', () => {
  it('has highlights for the current terms version', () => {
    const entry = TERMS_CHANGES[CURRENT_TERMS_VERSION];
    expect(entry).toBeDefined();
    expect(entry?.highlights.length).toBeGreaterThan(0);
  });
});

// The real summary text renders over every authed page (P1300): it may describe
// the documents only. Checked against the real entries, not a mock.
describe('terms change summary wording', () => {
  it('never mentions a session or a recording', () => {
    for (const [version, entry] of Object.entries(TERMS_CHANGES)) {
      for (const line of [...entry.highlights, ...entry.details]) {
        expect(line, `${version}: ${line}`).not.toMatch(/session|record/i);
      }
    }
  });
});
