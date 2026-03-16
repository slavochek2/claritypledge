/**
 * @file partner-template-page.tsx
 * @description P508: Public Partner Agreement Template Page.
 * Static public page at /partner-template showing a read-only AgreementCertificate
 * with mock data. No auth required. CTA drives to /agreements/new/create.
 */

import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { SEO } from '@/app/components/seo';
import { AgreementCertificate } from '@/app/components/agreements/agreement-certificate';
import { CertificatePageShell } from '@/app/components/layout/certificate-page-shell';
import { analytics } from '@/lib/mixpanel';

const MOCK_TERMS = `We'll focus on: our work conversations.
How to request a session: via email.
How often: at least once a month, unless we both agree to skip.
How long: at least 15 minutes per session.
Response time: acknowledge requests within 5 days.`;

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

      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 -ml-2 min-h-[44px] px-3"
        aria-label="Back to home"
      >
        <ArrowLeft size={16} />
        claritypledge.com
      </Link>

      <AgreementCertificate
        variant="active"
        creatorName="Alex Walker"
        partnerName="Jordan Rivera"
        creatorSignedAt="2026-03-01T00:00:00Z"
        partnerSignedAt="2026-03-01T00:00:00Z"
        termsText={MOCK_TERMS}
      />

      {/* Customizable hint + CTA — below the certificate */}
      <div className="mt-8 text-center space-y-6">
        <p className="text-sm md:text-base text-muted-foreground leading-relaxed max-w-lg mx-auto">
          &#9999;&#65039; The terms section is fully customizable. This is a template — when you create your own, you and your partner write the terms together.
        </p>

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
