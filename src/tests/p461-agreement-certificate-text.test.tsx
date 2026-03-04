/**
 * @file p461-agreement-certificate-text.test.tsx
 * @description Regression test for P461: Agreement certificate must display
 * the exact v3 bilateral text from the P422 spec.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgreementCertificate } from '@/app/components/agreements/agreement-certificate';

describe('P461: AgreementCertificate — v3 bilateral text', () => {
  beforeEach(() => {
    render(
      <AgreementCertificate
        variant="active"
        creatorName="Alice"
        partnerName="Bob"
        creatorSignedAt="2026-01-01T00:00:00Z"
        partnerSignedAt="2026-01-01T00:00:00Z"
      />
    );
  });

  it('shows v3 YOUR RIGHT text', () => {
    expect(
      screen.getByText(
        'When we speak, if either of us needs to know the other truly understood them, we can ask to have it mirrored back.'
      )
    ).toBeInTheDocument();
  });

  it('shows v3 OUR PROMISE as a single paragraph (not a bullet list)', () => {
    const el = screen.getByText(
      /We will explain back what we think the other meant/
    );
    expect(el).toBeInTheDocument();
    // Must be a single <p>, not a <li>
    expect(el.tagName).toBe('P');
    // Full text check
    expect(el.textContent).toBe(
      "We will explain back what we think the other meant\u2014withholding judgment or criticism\u2014so they can confirm or correct us. We won't pretend to understand if we don't."
    );
  });

  it('shows v3 THE EXCEPTION text', () => {
    expect(
      screen.getByText(
        "If either of us can't keep this promise in the moment, we'll explain why."
      )
    ).toBeInTheDocument();
  });

  it('does NOT show the old stale OUR PROMISE bullet text', () => {
    expect(
      screen.queryByText("We will paraphrase each other's perspective before responding.")
    ).toBeNull();
  });

  it('does NOT show the old stale EXCEPTION text', () => {
    expect(
      screen.queryByText(/Emergencies.*exempt from this practice/)
    ).toBeNull();
  });

  it('does NOT show unilateral pledge voice (I/you) in the bilateral certificate', () => {
    // Guard against accidentally importing pledge-text.tsx unilateral variants
    expect(screen.queryByText(/mirror back what I heard/)).toBeNull();
    expect(screen.queryByText(/if you need to know I truly understand/)).toBeNull();
  });
});
