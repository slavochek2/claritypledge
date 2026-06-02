/**
 * @file p461-agreement-certificate-text.test.tsx
 * @description P461 / P857: Agreement certificate version-aware rendering.
 *
 * P461 (original): regression guard — the bilateral v3 oath text must render
 *   byte-for-byte when no version prop is passed.
 *
 * P857 (extension): the component gains an `agreementVersion` prop. This file
 *   adds a describe block for the v4 first-person path and a fallback test for
 *   unknown version keys.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgreementCertificate } from '@/app/components/agreements/agreement-certificate';

// ---------------------------------------------------------------------------
// LEGACY PATH — no `agreementVersion` prop → defaults to 'legacy'
// All original P461 assertions must pass byte-for-byte on this path.
// ---------------------------------------------------------------------------
describe('P461: AgreementCertificate — legacy path (no version prop)', () => {
  // Each `it` renders fresh; no shared beforeEach so isolation is explicit.

  it('shows legacy YOUR RIGHT text', () => {
    render(
      <AgreementCertificate
        variant="active"
        creatorName="Alice"
        partnerName="Bob"
        creatorSignedAt="2026-01-01T00:00:00Z"
        partnerSignedAt="2026-01-01T00:00:00Z"
      />
    );
    expect(
      screen.getByText(
        'When we speak, if either of us needs to know the other truly understood them, we can ask to have it mirrored back.'
      )
    ).toBeInTheDocument();
  });

  it('shows legacy OUR PROMISE as a single <p> with full bilateral text', () => {
    render(
      <AgreementCertificate
        variant="active"
        creatorName="Alice"
        partnerName="Bob"
        creatorSignedAt="2026-01-01T00:00:00Z"
        partnerSignedAt="2026-01-01T00:00:00Z"
      />
    );
    const el = screen.getByText(/We will explain back what we think the other meant/);
    expect(el).toBeInTheDocument();
    expect(el.tagName).toBe('P');
    expect(el.textContent).toBe(
      // em-dash U+2014; right-single-quote U+2019
      "We will explain back what we think the other meant—withholding judgment or criticism—so they can confirm or correct us. We won’t pretend to understand if we don’t."
    );
  });

  it('shows legacy THE EXCEPTION text', () => {
    render(
      <AgreementCertificate
        variant="active"
        creatorName="Alice"
        partnerName="Bob"
        creatorSignedAt="2026-01-01T00:00:00Z"
        partnerSignedAt="2026-01-01T00:00:00Z"
      />
    );
    expect(
      screen.getByText("If either of us can’t keep this promise in the moment, we’ll explain why.")
    ).toBeInTheDocument();
  });

  it('does NOT show the old stale OUR PROMISE bullet text', () => {
    render(
      <AgreementCertificate
        variant="active"
        creatorName="Alice"
        partnerName="Bob"
        creatorSignedAt="2026-01-01T00:00:00Z"
        partnerSignedAt="2026-01-01T00:00:00Z"
      />
    );
    expect(
      screen.queryByText("We will paraphrase each other’s perspective before responding.")
    ).toBeNull();
  });

  it('does NOT show the old stale EXCEPTION text', () => {
    render(
      <AgreementCertificate
        variant="active"
        creatorName="Alice"
        partnerName="Bob"
        creatorSignedAt="2026-01-01T00:00:00Z"
        partnerSignedAt="2026-01-01T00:00:00Z"
      />
    );
    expect(screen.queryByText(/Emergencies.*exempt from this practice/)).toBeNull();
  });

  it('does NOT show unilateral pledge voice in the bilateral certificate', () => {
    // Guard: the legacy oath is bilateral ("We" framing). The pledge's
    // first-person v2/v3 variants ("mirror back what I heard", "if you need
    // to know I truly understand") must never bleed into the legacy agreement.
    // Note: v4 IS first-person by design (see v4 describe block below).
    render(
      <AgreementCertificate
        variant="active"
        creatorName="Alice"
        partnerName="Bob"
        creatorSignedAt="2026-01-01T00:00:00Z"
        partnerSignedAt="2026-01-01T00:00:00Z"
      />
    );
    expect(screen.queryByText(/mirror back what I heard/)).toBeNull();
    expect(screen.queryByText(/if you need to know I truly understand/)).toBeNull();
  });

  it('shows OUR PROMISE heading (not MY PROMISE) on the legacy path', () => {
    render(
      <AgreementCertificate
        variant="active"
        creatorName="Alice"
        partnerName="Bob"
        creatorSignedAt="2026-01-01T00:00:00Z"
        partnerSignedAt="2026-01-01T00:00:00Z"
      />
    );
    // The legacy registry entry stores "OUR PROMISE" as the heading label.
    // This heading must be present and the v4 heading "MY PROMISE" must be absent.
    expect(screen.getByText(/Our Promise/i)).toBeInTheDocument();
    expect(screen.queryByText(/My Promise/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// V4 PATH — `agreementVersion={4}` → renders VERIFIED_UNDERSTANDING_OATH[4]
// v4 oath body is first-person by design (Resolved Decision 1 in P857):
// the "My Promise" heading and "I'll give you an honest number..." body
// are correct and expected on this path.
// ---------------------------------------------------------------------------
describe('P857: AgreementCertificate — v4 first-person oath path', () => {
  it('shows v4 YOUR RIGHT text from VERIFIED_UNDERSTANDING_OATH[4]', () => {
    render(
      <AgreementCertificate
        variant="active"
        creatorName="Alice"
        partnerName="Bob"
        agreementVersion={4}
        creatorSignedAt="2026-01-01T00:00:00Z"
        partnerSignedAt="2026-01-01T00:00:00Z"
      />
    );
    // v4 YOUR RIGHT — emphasis is single-sourced from
    // VERIFIED_UNDERSTANDING_OATH[4].yourRight.boldPhrases via <OathText>, so the
    // key phrase renders BOLD and the sentence is split across spans. Assert the
    // bold phrase + the surrounding plain segments rather than the full string.
    expect(screen.getByText('how well I assume I cognitively understand')).toHaveClass('font-bold');
    expect(screen.getByText(/When we speak, please feel free to ask/)).toBeInTheDocument();
    expect(screen.getByText(/the intention behind what you say/)).toBeInTheDocument();
  });

  it('shows v4 MY PROMISE heading', () => {
    render(
      <AgreementCertificate
        variant="active"
        creatorName="Alice"
        partnerName="Bob"
        agreementVersion={4}
        creatorSignedAt="2026-01-01T00:00:00Z"
        partnerSignedAt="2026-01-01T00:00:00Z"
      />
    );
    // VERIFIED_UNDERSTANDING_OATH[4].myPromise.heading === "MY PROMISE"
    // The component renders the heading label from the registry entry.
    expect(screen.getByText(/My Promise/i)).toBeInTheDocument();
  });

  it('shows the v4 number-first promise text', () => {
    render(
      <AgreementCertificate
        variant="active"
        creatorName="Alice"
        partnerName="Bob"
        agreementVersion={4}
        creatorSignedAt="2026-01-01T00:00:00Z"
        partnerSignedAt="2026-01-01T00:00:00Z"
      />
    );
    // v4 MY PROMISE — key phrases render BOLD (single-sourced emphasis); the
    // number-first prose is present. Bold splits the text across spans, so assert
    // the bold phrases + a plain run.
    expect(screen.getByText('honest number')).toHaveClass('font-bold');
    expect(screen.getByText('the lower of our two numbers')).toHaveClass('font-bold');
    expect(screen.getByText(/from 0 \(not at all\) to 10/)).toBeInTheDocument();
  });

  it('shows v4 THE EXCEPTION text from VERIFIED_UNDERSTANDING_OATH[4]', () => {
    render(
      <AgreementCertificate
        variant="active"
        creatorName="Alice"
        partnerName="Bob"
        agreementVersion={4}
        creatorSignedAt="2026-01-01T00:00:00Z"
        partnerSignedAt="2026-01-01T00:00:00Z"
      />
    );
    // Verbatim from VERIFIED_UNDERSTANDING_OATH[4].exception.text
    expect(
      screen.getByText("If I can't give you an honest number in the moment, I'll explain why.")
    ).toBeInTheDocument();
  });

  it('does NOT show the legacy bilateral OUR PROMISE text on the v4 path', () => {
    render(
      <AgreementCertificate
        variant="active"
        creatorName="Alice"
        partnerName="Bob"
        agreementVersion={4}
        creatorSignedAt="2026-01-01T00:00:00Z"
        partnerSignedAt="2026-01-01T00:00:00Z"
      />
    );
    // The legacy "we will explain back" text must not appear on v4
    expect(screen.queryByText(/We will explain back what we think the other meant/)).toBeNull();
  });

  it('does NOT show pledge-only unilateral framing on the v4 path', () => {
    // v4 IS first-person (intentional — Resolved Decision 1) but it must NOT
    // contain pledge-specific framing. Guards:
    //
    // 1. "A Public Promise" — the pledge's subtitle (PLEDGE_VERSIONS[*].subtitle).
    //    The agreement's subtitle is "A mutual commitment to clarity", not this.
    // 2. "hereby commit to everyone" — the pledge's commitmentIntro, which
    //    addresses the general public. The agreement's intro is bilateral
    //    ("We, A and B, agree to:"), not a public declaration.
    //
    // These guards confirm the version-aware lookup returned an AGREEMENT_VERSIONS
    // entry, not accidentally something from PLEDGE_VERSIONS.
    render(
      <AgreementCertificate
        variant="active"
        creatorName="Alice"
        partnerName="Bob"
        agreementVersion={4}
        creatorSignedAt="2026-01-01T00:00:00Z"
        partnerSignedAt="2026-01-01T00:00:00Z"
      />
    );
    expect(screen.queryByText(/A Public Promise/)).toBeNull();
    expect(screen.queryByText(/hereby commit to everyone/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// UNKNOWN VERSION FALLBACK — must render legacy, not crash
// Proves the result-level `AGREEMENT_VERSIONS[v] ?? AGREEMENT_VERSIONS['legacy']`
// fallback (Security Review, Architecture Decision 5). A bare key-level lookup
// on an unknown version would return `undefined` and crash the component.
// ---------------------------------------------------------------------------
describe('P857: AgreementCertificate — unknown version falls back to legacy', () => {
  it('renders the legacy oath for an unrecognised version key', () => {
    // TS cast required to simulate a future DB value not yet in the union type.
    // This matches the scenario: a row written by a future deploy carries a
    // version key the current code does not know. The result-level fallback
    // `AGREEMENT_VERSIONS[v] ?? AGREEMENT_VERSIONS['legacy']` must handle it.
    render(
      <AgreementCertificate
        variant="active"
        creatorName="Alice"
        partnerName="Bob"
        agreementVersion={'v99' as never}
        creatorSignedAt="2026-01-01T00:00:00Z"
        partnerSignedAt="2026-01-01T00:00:00Z"
      />
    );
    // Must render legacy bilateral text, not crash
    expect(
      screen.getByText(
        'When we speak, if either of us needs to know the other truly understood them, we can ask to have it mirrored back.'
      )
    ).toBeInTheDocument();
    // Must NOT render v4 first-person text
    expect(screen.queryByText(/I'll give you an honest number/)).toBeNull();
  });
});
