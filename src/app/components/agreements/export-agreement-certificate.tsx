import { forwardRef } from 'react';

interface ExportAgreementCertificateProps {
  creatorName: string;
  partnerName: string;
  termsText?: string;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

/**
 * Fixed-size agreement certificate for PNG export via html-to-image.
 * Renders at 1080x1080 pixels with inline styles only (no Tailwind).
 * Mirrors the on-screen AgreementCertificate visual language.
 */
export const ExportAgreementCertificate = forwardRef<HTMLDivElement, ExportAgreementCertificateProps>(
  ({ creatorName, partnerName, termsText }, ref) => {
    const displayCreator = truncate(creatorName, 30);
    const displayPartner = truncate(partnerName, 30);

    return (
      <div
        ref={ref}
        style={{
          width: '1080px',
          height: '1080px',
          padding: '60px',
          backgroundColor: '#FDFBF7',
          border: '16px solid #002B5C',
          outline: '4px solid #002B5C',
          outlineOffset: '-24px',
          boxSizing: 'border-box',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            textAlign: 'center',
            paddingBottom: '20px',
            borderBottom: '3px solid #002B5C',
            marginBottom: '24px',
          }}
        >
          <h2
            style={{
              fontSize: '44px',
              fontWeight: '400',
              letterSpacing: '0.05em',
              color: '#1A1A1A',
              margin: '0 0 8px 0',
              fontFamily: 'Georgia, serif',
            }}
          >
            Clarity Partner Agreement
          </h2>
          <p
            style={{
              fontSize: '14px',
              color: 'rgba(26, 26, 26, 0.6)',
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              margin: 0,
            }}
          >
            A mutual commitment to clarity
          </p>
        </div>

        {/* "We, X and Y, agree to:" */}
        <div
          style={{
            fontSize: '22px',
            lineHeight: '1.6',
            color: '#1A1A1A',
            fontFamily: 'Georgia, serif',
            marginBottom: '16px',
          }}
        >
          We, <span style={{ fontWeight: 'bold' }}>{displayCreator}</span> and{' '}
          <span style={{ fontWeight: 'bold' }}>{displayPartner}</span>, agree to:
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid rgba(26, 26, 26, 0.2)', marginBottom: '16px' }} />

        {/* Your Right */}
        <div style={{ marginBottom: '16px' }}>
          <h4
            style={{
              fontSize: '24px',
              fontWeight: 'bold',
              color: '#0044CC',
              letterSpacing: '0.05em',
              margin: '0 0 10px 0',
            }}
          >
            YOUR RIGHT
          </h4>
          <p style={{ fontSize: '18px', lineHeight: '1.6', color: '#1A1A1A', margin: 0 }}>
            When we speak, if either of us needs to know the other truly understood them, we can ask
            to have it mirrored back.
          </p>
        </div>

        {/* Our Promise */}
        <div style={{ marginBottom: '16px' }}>
          <h4
            style={{
              fontSize: '24px',
              fontWeight: 'bold',
              color: '#0044CC',
              letterSpacing: '0.05em',
              margin: '0 0 10px 0',
            }}
          >
            OUR PROMISE
          </h4>
          <p style={{ fontSize: '18px', lineHeight: '1.6', color: '#1A1A1A', margin: 0 }}>
            We will explain back what we think the other meant—withholding judgment or criticism—so
            they can confirm or correct us. We won&apos;t pretend to understand if we don&apos;t.
          </p>
        </div>

        {/* The Exception */}
        <div style={{ marginBottom: '16px' }}>
          <h4
            style={{
              fontSize: '24px',
              fontWeight: 'bold',
              color: '#0044CC',
              letterSpacing: '0.05em',
              margin: '0 0 10px 0',
            }}
          >
            THE EXCEPTION
          </h4>
          <p style={{ fontSize: '18px', lineHeight: '1.6', color: '#1A1A1A', margin: 0 }}>
            If either of us can&apos;t keep this promise in the moment, we&apos;ll explain why.
          </p>
        </div>

        {/* Terms (if present) */}
        {termsText && (
          <div style={{ marginBottom: '16px', borderTop: '1px solid rgba(26,26,26,0.15)', paddingTop: '12px' }}>
            <p
              style={{
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                color: 'rgba(26, 26, 26, 0.5)',
                margin: '0 0 8px 0',
              }}
            >
              Our terms:
            </p>
            <p
              style={{
                fontSize: '15px',
                lineHeight: '1.5',
                color: 'rgba(26, 26, 26, 0.8)',
                margin: 0,
                whiteSpace: 'pre-wrap',
              }}
            >
              {termsText.length > 200 ? termsText.slice(0, 197) + '...' : termsText}
            </p>
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Bottom: Signatures + Seal + QR */}
        <div style={{ paddingTop: '20px', borderTop: '3px solid #002B5C' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px',
            }}
          >
            {/* Left: Creator */}
            <div style={{ flex: 1 }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: '#002B5C',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: '22px',
                  fontWeight: '600',
                  marginBottom: '8px',
                }}
              >
                {creatorName.charAt(0).toUpperCase()}
              </div>
              <p style={{ fontSize: '18px', fontWeight: '600', color: '#1A1A1A', margin: '0 0 2px 0' }}>
                {displayCreator}
              </p>
            </div>

            {/* Center: Gold seal */}
            <div style={{ width: '120px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
              <div
                style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  border: '4px solid #002B5C',
                  backgroundColor: '#FDFBF7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(0, 43, 92, 0.3)',
                }}
              >
                <svg width="48" height="48" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="64" cy="64" r="64" fill="#002B5C" />
                  <path
                    d="M88 40.5 C 82 35 73 32 64 32 C 44 32 32 48 32 64 C 32 80 44 96 64 96 C 73 96 82 93 88 87.5"
                    stroke="white"
                    strokeWidth="14"
                    strokeLinecap="round"
                    fill="none"
                  />
                </svg>
              </div>
            </div>

            {/* Right: Partner */}
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    backgroundColor: '#002B5C',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '22px',
                    fontWeight: '600',
                    marginBottom: '8px',
                    marginLeft: 'auto',
                  }}
                >
                  {partnerName.charAt(0).toUpperCase()}
                </div>
                <p style={{ fontSize: '18px', fontWeight: '600', color: '#1A1A1A', margin: '0 0 2px 0' }}>
                  {displayPartner}
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    );
  },
);

ExportAgreementCertificate.displayName = 'ExportAgreementCertificate';
