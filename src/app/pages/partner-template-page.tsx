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
import { TemplateStamp } from '@/app/components/agreements/template-stamp';
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
          agreement will say. P1229 D3: overflow-x-clip keeps the stamp's 880px
          nowrap span (and its scale(2.7) pre-landing state) from widening the
          layout viewport on phones — same clip `/` and `/hiring` already have. */}
      <div className="relative overflow-x-clip">
        <AgreementCertificate
          variant="active"
          agreementVersion={CURRENT_AGREEMENT_VERSION}
          creatorName="Albert Einstein"
          partnerName="Mother Teresa"
          creatorSignedAt="2026-03-01T00:00:00Z"
          partnerSignedAt="2026-03-01T00:00:00Z"
          termsText={MOCK_TERMS}
        />
        {/* Stamp overlay — slams in on scroll (matches the coach landing) */}
        <TemplateStamp animate />
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
