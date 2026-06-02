/**
 * @file partner-template-page.tsx
 * @description P508: Public Partner Agreement Template Page.
 * Static public page at /partner-template showing a read-only AgreementCertificate
 * with mock data. No auth required. CTA drives to /agreements/new/create.
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SEO } from '@/app/components/seo';
import { AgreementCertificate } from '@/app/components/agreements/agreement-certificate';
import { CURRENT_AGREEMENT_VERSION } from '@/app/content/agreement-versions';
import { CertificatePageShell } from '@/app/components/layout/certificate-page-shell';
import { analytics } from '@/lib/mixpanel';

const MOCK_TERMS = `We will use clarity sessions for our work conversations and decisions.
Either of us can request a session by email. The other person will respond within 5 days.
We commit to at least one session per month, unless we both agree to skip.
Each session will last at least 15 minutes.`;

export function PartnerTemplatePage() {
  useEffect(() => {
    analytics.track('partner_template_viewed', {
      referrer: document.referrer || 'direct',
    });
  }, []);

  return (
    <CertificatePageShell className="py-8 pb-24 md:py-12 md:pb-12">
      <SEO
        title="Partner Agreement Template"
        description="See what a Clarity Partner Agreement looks like. A mutual commitment to clarity between two partners."
        url="/partner-template"
      />

      {/* Hero intro */}
      <div className="text-center mb-8 space-y-2">
        <h1
          className="text-2xl md:text-3xl font-serif text-[#1A1A1A]"
          style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
        >
          What does a Clarity Partner Agreement look like?
        </h1>
        {/* "We all crave being understood. Let's commit to listen." now lives in
            the certificate header (agreement-certificate.tsx) so it travels with
            exports/shares — kept out of the hero here to avoid duplication. */}
        <p className="text-sm text-muted-foreground/70 italic">
          Takes 1 minute to create
        </p>
      </div>

      {/* Certificate with TEMPLATE stamp — reflects the current oath version
          (CURRENT_AGREEMENT_VERSION) so the public template matches what a new
          agreement will say. */}
      <div className="relative">
        <AgreementCertificate
          variant="active"
          agreementVersion={CURRENT_AGREEMENT_VERSION}
          creatorName="Alex Walker"
          partnerName="Jordan Rivera"
          creatorSignedAt="2026-03-01T00:00:00Z"
          partnerSignedAt="2026-03-01T00:00:00Z"
          termsText={MOCK_TERMS}
        />
        {/* Stamp overlay */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 pointer-events-none select-none"
          aria-hidden="true"
        >
          <span className="text-5xl md:text-6xl font-bold uppercase tracking-[0.2em] text-[#002B5C]/10 whitespace-nowrap">
            Template
          </span>
        </div>
      </div>

      {/* CTA */}
      <div className="mt-8 text-center space-y-4">
        <Link
          to="/agreements/new/create"
          className="inline-block bg-blue-500 hover:bg-blue-600 text-white font-semibold px-8 py-3 rounded-md transition-colors text-base"
        >
          Create Your Agreement &rarr;
        </Link>

        <p className="text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="underline hover:text-foreground transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    </CertificatePageShell>
  );
}

export default PartnerTemplatePage;
