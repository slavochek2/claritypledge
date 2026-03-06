/**
 * @file agreement-certificate.tsx
 * @description P422/P466: Bilateral Clarity Partner Agreement certificate component.
 * Renders the agreement in a formal certificate format with double-border frame,
 * bilateral pledge text, signature slots, and state-specific visuals.
 *
 * P466 additions:
 *   - `creation` variant: certificate IS the form (inline partner name input + editable terms)
 *   - `SignatureSlot` gains `value` prop for read-only display in creation mode
 *   - `AgreementCertificate` gains creation-mode callback props
 *   - Certificate outer element has role="region" aria-label for screen reader landmark
 */

import React from 'react';
import { ClarityLogoMark } from '@/components/ui/clarity-logo';
import { GravatarAvatar } from '@/components/ui/gravatar-avatar';

export type CertificateVariant = 'creation' | 'pending' | 'active' | 'celebration';

const TERMS_MAX = 1000;

export interface AgreementCertificateProps {
  variant: CertificateVariant;
  displayId?: string;           // e.g. "A-0042" — shown when available
  creatorName: string;
  creatorSignedAt?: string | null;  // ISO date string — when signed
  partnerName?: string;         // may be unknown in pending state
  partnerSignedAt?: string | null;
  termsText?: string;           // the agreement terms
  className?: string;
  footer?: React.ReactNode;

  // P480: avatar URLs for signature slots (null = show initials via GravatarAvatar)
  creatorAvatarUrl?: string | null;
  partnerAvatarUrl?: string | null;

  // P466: creation-mode props — omitting all = existing behavior unchanged
  onPartnerNameChange?: (name: string) => void;
  partnerNameValue?: string;
  partnerNameError?: string;
  partnerNamePlaceholder?: string;
  onTermsChange?: (text: string) => void;
  termsError?: string;
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
  value?: string;   // P466: overrides `name` with a read-only display value (creation mirror)
  signedAt?: string | null;
  isPending?: boolean;
  hideLabel?: boolean; // P472: hide CREATOR/PARTNER label in active/pending views
  avatarUrl?: string | null; // P480: photo URL; null = show initials via GravatarAvatar
}

function SignatureSlot({ label, name, value, signedAt, isPending, hideLabel, avatarUrl }: SignatureSlotProps) {
  const displayName = value !== undefined ? value : (name || 'Awaiting signature');

  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      {!hideLabel && (
        <p className="text-[10px] uppercase tracking-[0.15em] text-[#1A1A1A]/50 font-sans">
          {label}
        </p>
      )}
      {/* P480: avatar — shown only when a name is available (non-creation modes) */}
      {displayName && displayName !== 'Awaiting signature' && (
        <GravatarAvatar
          name={displayName}
          size="sm"
          photoUrl={avatarUrl ?? undefined}
          isPledger={false}
          avatarColor="#002B5C"
        />
      )}
      <p
        className="text-base font-semibold text-[#1A1A1A] leading-tight"
        style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
      >
        {displayName || <span className="text-[#1A1A1A]/30 font-normal">their name</span>}
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
  creatorName,
  creatorSignedAt,
  partnerName,
  partnerSignedAt,
  termsText,
  className = '',
  footer,
  creatorAvatarUrl,
  partnerAvatarUrl,
  onPartnerNameChange,
  partnerNameValue = '',
  partnerNameError,
  partnerNamePlaceholder = 'their name',
  onTermsChange,
  termsError,
}: AgreementCertificateProps) {
  const isActive = variant === 'active' || variant === 'celebration';
  const isPending = variant === 'pending';
  const isCreation = variant === 'creation';

  return (
    <div
      role="region"
      aria-label="Agreement certificate"
      className={`relative rounded-lg p-6 md:p-10 bg-[#FDFBF7] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.25)] ${className}`}
      style={{
        border: '8px solid #002B5C',
        outline: '2px solid #002B5C',
        outlineOffset: '-12px',
      }}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center space-y-2 pb-5 border-b-2 border-[#002B5C]">
          <h2
            className="text-2xl md:text-3xl font-serif tracking-wide text-[#1A1A1A]"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            Clarity Partner Agreement
          </h2>
          <p className="text-[10px] md:text-xs text-[#1A1A1A]/60 uppercase tracking-[0.2em] font-sans">
            A mutual commitment to clarity
          </p>
        </div>

        {/* "We, X and Y, agree to:" — editable input when onPartnerNameChange provided, else read-only */}
        {(isCreation || isPending) && onPartnerNameChange ? (
          <div>
            <p
              className="text-base md:text-lg leading-relaxed text-[#1A1A1A]"
              style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
            >
              We,{' '}
              <span className="font-semibold">{creatorName}</span>
              {' '}and{' '}
              <input
                type="text"
                aria-label="Partner's full name"
                aria-required="true"
                aria-invalid={partnerNameError ? 'true' : undefined}
                aria-describedby={partnerNameError ? 'partner-name-error' : undefined}
                value={partnerNameValue}
                onChange={e => onPartnerNameChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                placeholder={partnerNamePlaceholder}
                maxLength={110}
                className={`border-0 rounded-none bg-transparent focus-visible:outline-none focus-visible:ring-0 font-serif text-base md:text-lg font-semibold inline-block min-w-[200px] w-auto placeholder:text-[#1A1A1A]/30 placeholder:font-normal ${
                  partnerNameError
                    ? 'border-b-2 border-red-500 focus-visible:border-red-500'
                    : 'border-b-2 border-[#1A1A1A]/20 focus-visible:border-[#0044CC]'
                }`}
                style={{
                  fontFamily: '"Playfair Display", Georgia, serif',
                  width: `${Math.max(200, (partnerNameValue?.length ?? 0) * 12)}px`,
                  maxWidth: '100%',
                }}
              />,
              {' '}agree to:
            </p>
            {partnerNameError && (
              <p id="partner-name-error" role="alert" className="text-sm text-red-500 mt-1">
                {partnerNameError}
              </p>
            )}
          </div>
        ) : (isPending || isActive) && (
          <p
            className="text-base md:text-lg leading-relaxed text-[#1A1A1A]"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            We,{' '}
            <span className="font-semibold">{creatorName}</span>
            {' '}and{' '}
            <span className="font-semibold">{partnerName || <span className="text-[#1A1A1A]/30 font-normal">their name</span>}</span>
            , agree to:
          </p>
        )}

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
        {isCreation && onTermsChange ? (
          <div className="space-y-1.5 border-t border-[#1A1A1A]/15 pt-4">
            <label
              htmlFor="agreement-terms"
              className="text-xs uppercase tracking-[0.15em] text-[#1A1A1A]/50 font-sans block"
            >
              Our terms:
            </label>
            <textarea
              id="agreement-terms"
              aria-describedby="terms-char-count"
              aria-invalid={termsError ? 'true' : undefined}
              value={termsText ?? ''}
              maxLength={TERMS_MAX}
              onChange={e => onTermsChange(e.target.value)}
              rows={8}
              className={`w-full resize-y bg-[#F5F1E8] focus:bg-transparent border-0 border-b text-sm leading-relaxed text-[#1A1A1A]/80 focus-visible:outline-none focus-visible:ring-0 placeholder:text-[#1A1A1A]/30 min-h-[120px] font-sans transition-colors ${
                termsError ? 'border-red-400' : 'border-[#1A1A1A]/20 focus-visible:border-[#0044CC]'
              }`}
            />
            <div className="flex justify-end">
              <span
                id="terms-char-count"
                aria-live="polite"
                className="text-xs text-[#1A1A1A]/40 font-sans mt-1"
              >
                {termsText?.length ?? 0}/{TERMS_MAX}
              </span>
            </div>
            {termsError && (
              <p className="text-sm text-red-500" role="alert">{termsError}</p>
            )}
          </div>
        ) : termsText ? (
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
        ) : null}


        {/* Signatures + seal — only once active */}
        {isActive && (
          <div className="pt-5 border-t-2 border-[#002B5C]">
            <div className="flex items-start justify-between gap-4">
              {/* Creator signature */}
              <SignatureSlot
                label="Creator"
                name={creatorName}
                signedAt={isActive || isPending ? null : creatorSignedAt}
                isPending={false}
                hideLabel={isActive || isPending}
                avatarUrl={creatorAvatarUrl}
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
                signedAt={isActive || isPending ? null : partnerSignedAt}
                isPending={isPending}
                hideLabel={isActive || isPending}
                avatarUrl={partnerAvatarUrl}
              />
            </div>

            {/* A-active-1: Single "Active since" line below both names */}
            {isActive && partnerSignedAt && (
              <p className="text-xs text-[#1A1A1A]/60 text-center mt-3 font-sans">
                Active since {formatSignedDate(partnerSignedAt)}
              </p>
            )}
          </div>
        )}

        {footer && (
          <div className="pt-6 border-t border-[#1A1A1A]/10">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
