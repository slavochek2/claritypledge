/**
 * @file agreement-certificate.tsx
 * @description P422: Bilateral Clarity Partner Agreement certificate component.
 * Renders the agreement in a formal certificate format with double-border frame,
 * bilateral pledge text, signature slots, and state-specific visuals.
 */

import { ClarityLogoMark } from '@/components/ui/clarity-logo';

export type CertificateVariant = 'creation' | 'pending' | 'active' | 'celebration';

export interface AgreementCertificateProps {
  variant: CertificateVariant;
  displayId?: string;           // e.g. "A-0042" — shown when available
  creatorName: string;
  creatorSignedAt?: string | null;  // ISO date string — when signed
  partnerName?: string;         // may be unknown in pending state
  partnerSignedAt?: string | null;
  termsText?: string;           // the agreement terms
  className?: string;
}

function formatSignedDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

interface SignatureSlotProps {
  label: string;
  name?: string;
  signedAt?: string | null;
  isPending?: boolean;
}

function SignatureSlot({ label, name, signedAt, isPending }: SignatureSlotProps) {
  const displayName = name || 'Awaiting signature';

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <p className="text-[10px] uppercase tracking-[0.15em] text-[#1A1A1A]/50 font-sans">
        {label}
      </p>
      <p
        className="text-base font-semibold text-[#1A1A1A] leading-tight"
        style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
      >
        {displayName}
      </p>
      {signedAt ? (
        <p className="text-xs text-[#1A1A1A]/60">
          Signed on {formatSignedDate(signedAt)}
        </p>
      ) : (
        <div className="flex items-center gap-1.5 mt-1">
          <div className="h-px flex-1 bg-[#1A1A1A]/30" />
          {isPending && (
            <span className="text-xs text-[#1A1A1A]/50" aria-label="Awaiting signature">
              ...
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function AgreementCertificate({
  variant,
  displayId,
  creatorName,
  creatorSignedAt,
  partnerName,
  partnerSignedAt,
  termsText,
  className = '',
}: AgreementCertificateProps) {
  const isActive = variant === 'active' || variant === 'celebration';
  const isPending = variant === 'pending';

  return (
    <div
      className={`relative rounded-lg p-6 md:p-10 bg-[#FDFBF7] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] ${className}`}
      style={{
        border: '8px solid #002B5C',
        outline: '2px solid #002B5C',
        outlineOffset: '-12px',
      }}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center space-y-1.5 pb-5 border-b-2 border-[#002B5C]">
          {displayId && (
            <p className="text-[10px] uppercase tracking-[0.25em] text-[#1A1A1A]/50 font-sans mb-2">
              {displayId}
            </p>
          )}
          <h2
            className="text-2xl md:text-3xl font-serif tracking-wide text-[#1A1A1A]"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            Clarity Partner Agreement
          </h2>
          <p className="text-[10px] md:text-xs text-[#1A1A1A]/60 uppercase tracking-[0.2em] font-sans">
            A bilateral commitment to clarity
          </p>
        </div>

        {/* Opening tagline */}
        <p
          className="text-center text-sm md:text-base italic text-[#1A1A1A]/70"
          style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
        >
          We all crave being understood. Let&apos;s commit to listen.
        </p>

        {/* YOUR RIGHT */}
        <div className="space-y-2">
          <h3 className="text-base md:text-lg font-bold text-[#0044CC] tracking-wide uppercase">
            Your Right
          </h3>
          <p
            className="text-base md:text-lg leading-relaxed text-[#1A1A1A]"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            When we speak, if either of us needs to know the other truly understood them, we can ask to have it mirrored back.
          </p>
        </div>

        {/* OUR PROMISE */}
        <div className="space-y-2">
          <h3 className="text-base md:text-lg font-bold text-[#0044CC] tracking-wide uppercase">
            Our Promise
          </h3>
          <p
            className="text-base md:text-lg leading-relaxed text-[#1A1A1A]"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            We will explain back what we think the other meant&mdash;withholding judgment or criticism&mdash;so they can confirm or correct us. We won&apos;t pretend to understand if we don&apos;t.
          </p>
        </div>

        {/* THE EXCEPTION */}
        <div className="space-y-2">
          <h3 className="text-base md:text-lg font-bold text-[#0044CC] tracking-wide uppercase">
            The Exception
          </h3>
          <p
            className="text-base md:text-lg leading-relaxed text-[#1A1A1A]"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            If either of us can&apos;t keep this promise in the moment, we&apos;ll explain why.
          </p>
        </div>

        {/* Terms section */}
        {termsText && (
          <div className="space-y-1.5 border-t border-[#1A1A1A]/15 pt-4">
            <p className="text-xs uppercase tracking-[0.15em] text-[#1A1A1A]/50 font-sans">
              Our terms:
            </p>
            <p
              className="text-sm leading-relaxed text-[#1A1A1A]/80 whitespace-pre-wrap"
              style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
            >
              {termsText}
            </p>
          </div>
        )}

        {/* Signatures + seal */}
        <div className="pt-5 border-t-2 border-[#002B5C]">
          <div className="flex items-start justify-between gap-4">
            {/* Creator signature */}
            <SignatureSlot
              label="Creator"
              name={creatorName}
              signedAt={creatorSignedAt}
              isPending={false}
            />

            {/* Center seal — only when active */}
            {isActive ? (
              <div className="flex-shrink-0 flex flex-col items-center gap-1 pt-1">
                <div className="w-14 h-14 rounded-full border-[3px] border-[#D4AF37] flex items-center justify-center bg-[#FDFBF7] shadow-md">
                  <ClarityLogoMark size={48} className="text-[#D4AF37]" />
                </div>
                <p className="text-[9px] uppercase tracking-[0.15em] text-[#D4AF37] font-sans">
                  Active
                </p>
              </div>
            ) : (
              <div className="flex-shrink-0 w-14 h-14 rounded-full border-2 border-dashed border-[#1A1A1A]/20 flex items-center justify-center">
                <ClarityLogoMark size={40} className="text-[#1A1A1A]/20" />
              </div>
            )}

            {/* Partner signature */}
            <SignatureSlot
              label="Partner"
              name={partnerName}
              signedAt={partnerSignedAt}
              isPending={isPending}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
