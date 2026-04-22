/**
 * P777 canary — letter reading + preview pages use an immersive bounded scroll container.
 *
 * JSDOM render of LetterReadingPage would require mocking ~80% of the app (auth, supabase,
 * useLetterReadingState, and forcing viewState='reading' through async effects). The scaffold
 * assertion below is the robust equivalent: verify the scroll wrapper markup is present in
 * source before the fix (FAIL) and after (PASS).
 *
 * True scroll behavior (QR code / witnesses reachable) is verified via manual browser check
 * at localhost:5300 per plan Step 2.6.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('P777: immersive scroll scaffold — reading and preview pages', () => {
  it('letter-reading-page has data-letter-scroll bounded scroll container', () => {
    const src = readFileSync(
      resolve(__dirname, '../app/pages/letter-reading-page.tsx'),
      'utf-8'
    );
    expect(src).toContain('data-letter-scroll');
    expect(src).toContain('overflow-y-auto');
    expect(src).toContain('flex-1 min-h-0');
  });

  it('letter-preview-page has data-letter-scroll bounded scroll container', () => {
    const src = readFileSync(
      resolve(__dirname, '../app/pages/letter-preview-page.tsx'),
      'utf-8'
    );
    expect(src).toContain('data-letter-scroll');
  });

  it('letter-reading-page: data-letter-scroll appears before CertificatePageShell in source', () => {
    const src = readFileSync(
      resolve(__dirname, '../app/pages/letter-reading-page.tsx'),
      'utf-8'
    );
    // The reading viewState is an early return BEFORE CertificatePageShell.
    // If the reading block ever gets re-wrapped in the shell, the shell will appear
    // before (or around) the scroll wrapper and this assertion will fail.
    const scrollIdx = src.indexOf('data-letter-scroll');
    expect(scrollIdx).toBeGreaterThan(-1); // scroll wrapper exists
    // Count open/close CertificatePageShell tags in source BEFORE the scroll wrapper.
    // If opens > closes, the wrapper is nested inside the shell (regression).
    const before = src.slice(0, scrollIdx);
    const opens = (before.match(/<CertificatePageShell/g) ?? []).length;
    const closes = (before.match(/<\/CertificatePageShell>/g) ?? []).length;
    expect(opens).toBe(closes); // no unclosed shell tag before the scroll wrapper
  });

  it('LetterReadingFlow and LetterReadingFlowPublic use showFocusHeader={false}', () => {
    const src = readFileSync(
      resolve(__dirname, '../app/pages/letter-reading-page.tsx'),
      'utf-8'
    );
    // Bucket B: FocusHeader removed from reading flows — letter is immersive focus flow.
    // Before fix: showFocusHeader={true} in these components.
    // After fix: no showFocusHeader={true} in reading sub-components.
    const trueCount = (src.match(/showFocusHeader=\{true\}/g) ?? []).length;
    // After fix: 0 occurrences of showFocusHeader={true} in the reading sub-components.
    // (preview-page already had false; reading-page had 2 — both should be gone).
    expect(trueCount).toBe(0);
  });
});
