import { describe, it, expect } from 'vitest';
import { CURRENT_TERMS_VERSION } from '@/lib/constants';
import { TERMS_CHANGES } from '@/app/content/terms-changes';
import { termsPrompt } from '@/app/content/terms-prompt';

// The re-acceptance popup must say what changed. A version bump without a
// summary would show returning users two long documents and nothing else.
describe('terms change summary', () => {
  it('has highlights for the current terms version', () => {
    const entry = TERMS_CHANGES[CURRENT_TERMS_VERSION];
    expect(entry).toBeDefined();
    expect(entry?.highlights.length).toBeGreaterThan(0);
    // Details on demand stay short; the full documents carry the rest.
    expect(entry?.highlights.length).toBeLessThanOrEqual(3);
  });
});

// A notice opens with what the person gains, in words a stranger knows (founder, P1596). Internal
// terms are allowed lower down only where the plain word does not exist.
describe('terms notice opening', () => {
  it('has its own title and avoids our internal words', () => {
    const entry = TERMS_CHANGES[CURRENT_TERMS_VERSION];
    expect(entry?.title).toBeTruthy();
    expect(`${entry?.title} ${entry?.headline}`).not.toMatch(/\btranscripts?\b|thread|channel|\brounds?\b|attribution/i);
  });

  it('announces a new feature as new, and never opens one with the terms', () => {
    for (const [version, entry] of Object.entries(TERMS_CHANGES)) {
      if (entry.kind !== 'feature') continue;
      expect(entry.title, version).toMatch(/^New\b/);
      expect(entry.title, version).not.toMatch(/terms|privacy/i);
    }
  });
});

// The real summary text renders over every authed page (P1300): it may describe
// the documents only. Checked against the real entries, not a mock.
describe('terms change summary wording', () => {
  it('never mentions a session or a recording', () => {
    // The notice sits over every page, so these words would read as a claim about that page.
    for (const [version, entry] of Object.entries(TERMS_CHANGES)) {
      for (const line of [entry.headline, ...entry.highlights]) {
        expect(line, `${version}: ${line}`).not.toMatch(/session|record/i);
      }
    }
  });
});

// Skipping a version that needed consent must not be excused by a later notice-only one.
describe('termsPrompt', () => {
  it('blocks someone who skipped a consent version, and carries what they missed', () => {
    const prompt = termsPrompt('v1.4');
    expect(prompt.mode).toBe('block');
    expect(prompt.missed).toEqual([TERMS_CHANGES['v1.5']]);
  });
  it('only notifies someone who already gave that consent', () => {
    expect(termsPrompt('v1.5')).toEqual({ mode: 'notice', missed: [] });
  });
  it('treats an unknown version as having seen nothing', () => {
    expect(termsPrompt(null).mode).toBe('block');
    expect(termsPrompt('v0.9').missed).toContain(TERMS_CHANGES['v1.5']);
  });
  it('relies on newest-first order', () => {
    const numbers = Object.keys(TERMS_CHANGES).map((v) => Number(v.slice(1)));
    expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
    expect(Object.keys(TERMS_CHANGES)[0]).toBe(CURRENT_TERMS_VERSION);
  });
});
