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
import { AGREEMENT_VERSIONS, type AgreementVersion } from '@/app/content/agreement-versions';
import { CertificateFrame, CertificateOathBody, CERTIFICATE_SERIF } from './certificate-frame';

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
  agreementVersion?: AgreementVersion;  // P857: pinned oath version (default 'legacy')
  className?: string;
  footer?: React.ReactNode;

  // P480: avatar URLs for signature slots (null = show initials via GravatarAvatar)
  creatorAvatarUrl?: string | null;
  partnerAvatarUrl?: string | null;

  // Profile page URLs for linking names/avatars
  creatorProfileUrl?: string | null;
  partnerProfileUrl?: string | null;

  // P466: creation-mode props — omitting all = existing behavior unchanged
  onPartnerNameChange?: (name: string) => void;
  partnerNameValue?: string;
  partnerNameError?: string;
  partnerNamePlaceholder?: string;
  partnerNameReadOnly?: boolean; // P483: lock name field when existing user found
  onTermsChange?: (text: string) => void;
  termsError?: string;
  termsPlaceholder?: string;    // suggestion shown when terms are empty (not written on the user's behalf)
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
  profileUrl?: string | null; // Profile page URL for linking name/avatar
}

function SignatureSlot({ label, name, value, signedAt, isPending, hideLabel, avatarUrl, profileUrl }: SignatureSlotProps) {
  const displayName = value !== undefined ? value : (name || 'Awaiting signature');
  const hasProfile = profileUrl && displayName && displayName !== 'Awaiting signature';

  const avatarAndName = (
    <>
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
        className={`text-base font-semibold text-[#1A1A1A] leading-tight ${hasProfile ? 'group-hover/slot:text-[#0044CC] group-hover/slot:underline transition-colors' : ''}`}
        style={{ fontFamily: CERTIFICATE_SERIF }}
      >
        {displayName || <span className="text-[#1A1A1A]/30 font-normal">their name</span>}
      </p>
    </>
  );

  return (
    <div className="flex flex-col items-center gap-1.5 min-w-0 flex-1">
      {!hideLabel && (
        <p className="text-[10px] uppercase tracking-[0.15em] text-[#1A1A1A]/50 font-sans">
          {label}
        </p>
      )}
      {hasProfile ? (
        <a href={profileUrl} className="flex flex-col items-center gap-1.5 group/slot">
          {avatarAndName}
        </a>
      ) : (
        avatarAndName
      )}
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
  agreementVersion = 'legacy',
  className = '',
  footer,
  creatorAvatarUrl,
  partnerAvatarUrl,
  creatorProfileUrl,
  partnerProfileUrl,
  onPartnerNameChange,
  partnerNameValue = '',
  partnerNameError,
  partnerNamePlaceholder = 'their name',
  partnerNameReadOnly,
  onTermsChange,
  termsError,
  termsPlaceholder,
}: AgreementCertificateProps) {
  const isActive = variant === 'active' || variant === 'celebration';
  const isPending = variant === 'pending';
  const isCreation = variant === 'creation';

  // P857: oath body resolves from the pinned version. Result-level fallback
  // (not key-level) so an unknown/future version value renders legacy instead
  // of crashing — mirrors profile-certificate.tsx. The bilateral intro line
  // ("We, A and B, agree to:") stays hardcoded above; only these three blocks
  // are version-aware.
  const oath = AGREEMENT_VERSIONS[agreementVersion] ?? AGREEMENT_VERSIONS['legacy'];
  const oathSections = [oath.yourRight, oath.myPromise, oath.exception];

  return (
    <CertificateFrame
      ariaLabel="Agreement certificate"
      title="Clarity Partner Agreement"
      kicker="A mutual commitment to clarity"
      epigraph="We all crave being understood. Let's commit to listen."
      className={className}
    >

        {/* "We, X and Y, agree to:" — editable input when onPartnerNameChange provided, else read-only */}
        {(isCreation || isPending) && onPartnerNameChange ? (
          <div>
            <p
              className="text-base md:text-lg leading-relaxed text-[#1A1A1A]"
              style={{ fontFamily: CERTIFICATE_SERIF }}
            >
              We,{' '}
              {creatorProfileUrl ? (
                <a href={creatorProfileUrl} className="font-semibold hover:text-[#0044CC] hover:underline transition-colors">{creatorName}</a>
              ) : (
                <span className="font-semibold">{creatorName}</span>
              )}
              {' '}and{' '}
              <input
                type="text"
                aria-label="Partner's full name"
                aria-required="true"
                aria-invalid={partnerNameError ? 'true' : undefined}
                aria-describedby={partnerNameError ? 'partner-name-error' : undefined}
                aria-readonly={partnerNameReadOnly ? 'true' : undefined}
                readOnly={partnerNameReadOnly}
                value={partnerNameValue}
                onChange={e => onPartnerNameChange(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
                placeholder={partnerNamePlaceholder}
                maxLength={110}
                className={`border-0 rounded-none bg-transparent focus-visible:outline-none focus-visible:ring-0 font-serif text-base md:text-lg font-semibold inline-block min-w-[200px] w-auto placeholder:text-[#1A1A1A]/30 placeholder:font-normal ${
                  partnerNameReadOnly
                    ? 'cursor-default bg-[#F5F1E8]/50 border-b-2 border-[#1A1A1A]/20'
                    : partnerNameError
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
            style={{ fontFamily: CERTIFICATE_SERIF }}
          >
            We,{' '}
            {creatorProfileUrl ? (
              <a href={creatorProfileUrl} className="font-semibold hover:text-[#0044CC] hover:underline transition-colors">{creatorName}</a>
            ) : (
              <span className="font-semibold">{creatorName}</span>
            )}
            {' '}and{' '}
            {partnerProfileUrl && partnerName ? (
              <a href={partnerProfileUrl} className="font-semibold hover:text-[#0044CC] hover:underline transition-colors">{partnerName}</a>
            ) : (
              <span className="font-semibold">{partnerName || <span className="text-[#1A1A1A]/30 font-normal">their name</span>}</span>
            )}
            , agree to:
          </p>
        )}

        {/* Oath body — version-aware (P857). Shared render (certificate-frame.tsx),
            single-sourced with the Clarity Organization Terms. <OathText> handles
            emphasis (boldPhrases) and the v4 paragraph breaks; legacy has neither
            and renders plain. */}
        <CertificateOathBody sections={oathSections} />

        {/* Terms section */}
        {isCreation && onTermsChange ? (
          <div className="space-y-1.5 border-t border-[#1A1A1A]/15 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <label
                htmlFor="agreement-terms"
                className="text-xs uppercase tracking-[0.15em] text-[#1A1A1A]/50 font-sans whitespace-nowrap"
              >
                Our terms:
              </label>
              {/* Insert affordance: pulls the greyed suggestion into the editable
                  field so a dyad can start from the scaffold and modify it. Shown
                  only while the field is empty (it is a starting point, not an
                  overwrite). Single-sources the inserted text to the same
                  termsPlaceholder shown behind the field — no clipboard round-trip. */}
              {termsPlaceholder && !termsText?.trim() && (
                <button
                  type="button"
                  onClick={() => onTermsChange(termsPlaceholder)}
                  className="inline-flex items-center text-xs font-sans font-medium text-[#0044CC] hover:text-[#0033AA] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0044CC]/40 rounded px-1.5 py-1 min-h-[44px] sm:min-h-0 transition-colors whitespace-nowrap"
                >
                  Use suggested terms
                </button>
              )}
            </div>
            <textarea
              id="agreement-terms"
              aria-describedby="terms-char-count"
              aria-invalid={termsError ? 'true' : undefined}
              value={termsText ?? ''}
              placeholder={termsPlaceholder}
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
              style={{ fontFamily: CERTIFICATE_SERIF }}
            >
              {termsText}
            </p>
          </div>
        ) : null}


        {/* Signatures + seal — only once active */}
        {isActive && (
          <div className="pt-5 border-t-2 border-[#002B5C]">
            <div className="flex items-center justify-between gap-4">
              {/* Creator signature */}
              <SignatureSlot
                label="Creator"
                name={creatorName}
                signedAt={isActive || isPending ? null : creatorSignedAt}
                isPending={false}
                hideLabel={isActive || isPending}
                avatarUrl={creatorAvatarUrl}
                profileUrl={creatorProfileUrl}
              />

              {/* Center seal — only when active */}
              {isActive ? (
                <div className="flex-shrink-0 w-14 h-14 rounded-full border-[3px] border-[#D4AF37] flex items-center justify-center bg-[#FDFBF7] shadow-md">
                  <ClarityLogoMark size={48} className="text-[#D4AF37]" />
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
                profileUrl={partnerProfileUrl}
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
    </CertificateFrame>
  );
}
