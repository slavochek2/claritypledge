/**
 * @file create-agreement-page.tsx
 * @description P466: Create Clarity Partner Agreement — certificate-as-form redesign.
 * Route: /agreements/new
 *
 * The certificate IS the form. Editable partner name is inline in the certificate
 * body. Email and visibility controls appear below the certificate.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth';
import { agreementsService } from '@/app/data/agreements-service';
import type { AgreementParty, AgreementVisibility, ProfileSearchResult } from '@/app/data/agreements-service';
import { ProfilePickerInput } from '@/app/components/shared/profile-picker-input';
import { AgreementCertificate } from '@/app/components/agreements/agreement-certificate';
import { CURRENT_AGREEMENT_VERSION } from '@/app/content/agreement-versions';
import { Loader2Icon, GlobeIcon, LockIcon, ArrowLeft } from 'lucide-react';
import { ClarityLoader } from '@/components/ui/clarity-loader';
import { Button } from '@/components/ui/button';
import { MobileTooltip } from '@/app/components/shared/mobile-tooltip';
import { toast } from 'sonner';
import { analytics } from '@/lib/mixpanel';
import { CertificatePageShell } from '@/app/components/layout/certificate-page-shell';

const TERMS_MAX = 1000;

/** P483: Does this lookup result represent an existing user with a valid name? */
function isExistingUserWithName(party: { name: string }): boolean {
  const name = party.name?.trim();
  return !!name && name !== 'Unknown';
}

// A *suggestion* of what to define — shown as a greyed placeholder, never written
// into the agreement on the user's behalf. The dyad writes their own terms (the
// "Terms cannot be empty" validation enforces it), or pulls this scaffold into the
// editable field via the certificate's "Use suggested terms" button. The v4 oath
// carries the calibration mechanic; the terms add the three dimensions the oath
// doesn't: channel (sync live / async letters), scope (which topics), and a
// graceful termination (one final clarity cycle before parting).
const TERMS_PLACEHOLDER = `Request channel: [synchronous in live meetings / asynchronous via clarity letters]
Scope: [limited to specific topics or meeting type]
Termination: [before ending, we each answer one final clarity letter and hold one clarity live session]`;

const VISIBILITY_OPTIONS: {
  value: AgreementVisibility;
  icon: typeof GlobeIcon;
  label: string;
  tooltip: string;
}[] = [
  { value: 'public', icon: GlobeIcon, label: 'Public', tooltip: 'Anyone can view this agreement.' },
  { value: 'private', icon: LockIcon, label: 'Private', tooltip: 'Only you and your partner can view this agreement.' },
];

function AvatarBadge({ party }: { party: AgreementParty }) {
  const initials = party.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center gap-2 mt-2">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
        style={{ backgroundColor: party.avatarColor }}
        aria-hidden="true"
      >
        {party.avatarUrl ? (
          <img src={party.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
        ) : (
          initials
        )}
      </div>
      <span className="text-sm font-medium text-foreground">{party.name}</span>
    </div>
  );
}

export function CreateAgreementPage() {
  const navigate = useNavigate();
  const { user, session, isLoading: authLoading } = useAuth();

  // Form state
  const [partnerName, setPartnerName] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [visibility, setVisibility] = useState<AgreementVisibility>('public');
  const [termsText, setTermsText] = useState('');

  // P483: lock partner name field when existing user found with valid profile name
  const [isPartnerNameLocked, setIsPartnerNameLocked] = useState(false);

  // Lookup state
  const [lookupResult, setLookupResult] = useState<AgreementParty | null | 'not-found'>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // P878: picker-selected partner (addressed by profile_id, AD-6)
  const [selectedPartner, setSelectedPartner] = useState<ProfileSearchResult | null>(null);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Validation errors
  const [errors, setErrors] = useState<{
    partnerName?: string;
    partnerEmail?: string;
    termsText?: string;
  }>({});

  // Creator name + slug — available directly from the Profile context (no DB fetch needed)
  const creatorName = user?.name ?? undefined;
  const creatorSlug = user?.slug ?? null;

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !session) {
      navigate('/login');
    }
  }, [authLoading, session, navigate]);

  // Partner name change handler
  const handlePartnerNameChange = useCallback((name: string) => {
    setPartnerName(name);
    setErrors((prev) => prev.partnerName && name.trim() ? { ...prev, partnerName: undefined } : prev);
    setSubmitError(null);
  }, []);

  // P878: picker selection — partner addressed by profile_id, name auto-filled + locked
  const handlePartnerSelect = useCallback((result: ProfileSearchResult | null) => {
    setSelectedPartner(result);
    setErrors((prev) => ({ ...prev, partnerEmail: undefined }));
    setSubmitError(null);
    setLookupResult(null);
    if (result) {
      setPartnerName(result.name);
      setIsPartnerNameLocked(true);
    } else {
      setIsPartnerNameLocked(false);
      setPartnerName('');
    }
  }, []);

  // Debounced email lookup (first-contact fallback path — P878 keeps this intact)
  const handleEmailChange = useCallback(
    (email: string) => {
      setPartnerEmail(email);
      setLookupResult(null);
      setErrors((prev) => ({ ...prev, partnerEmail: undefined }));
      setSubmitError(null);
      // P483: only clear name if it was auto-filled by a previous lookup
      if (isPartnerNameLocked) {
        setIsPartnerNameLocked(false);
        setPartnerName('');
      }

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      const trimmed = email.trim();
      if (!trimmed || !trimmed.includes('@')) return;

      debounceRef.current = setTimeout(async () => {
        // Self-invite check
        if (user?.email && trimmed.toLowerCase() === user.email.toLowerCase()) {
          setErrors((prev) => ({ ...prev, partnerEmail: "You can't invite yourself" }));
          return;
        }

        setIsLookingUp(true);
        try {
          const party = await agreementsService.lookupUserByEmail(trimmed);
          analytics.track('agreement_email_lookup', { found: !!party });
          setLookupResult(party ?? 'not-found');

          // P483: Always override name when existing user has valid profile name
          if (party && isExistingUserWithName(party)) {
            setPartnerName(party.name);
            setIsPartnerNameLocked(true);
          }
        } finally {
          setIsLookingUp(false);
        }
      }, 400);
    },
    [user?.email, isPartnerNameLocked]
  );

  const handleTermsChange = (text: string) => {
    if (text.length <= TERMS_MAX) {
      setTermsText(text);
    }
    if (errors.termsText && text.trim()) {
      setErrors((prev) => ({ ...prev, termsText: undefined }));
    }
  };

  const validate = (): boolean => {
    const newErrors: { partnerName?: string; partnerEmail?: string; termsText?: string } = {};

    const nameTrimmed = partnerName.trim();
    if (!nameTrimmed) {
      newErrors.partnerName = 'Partner name is required';
    } else if (nameTrimmed.length > 100) {
      newErrors.partnerName = 'Name must be 100 characters or fewer';
    }

    // P878: a picker-selected partner satisfies the recipient requirement without an email
    const emailTrimmed = partnerEmail.trim();
    if (!selectedPartner) {
      if (!emailTrimmed) {
        newErrors.partnerEmail = 'Partner email is required';
      } else if (user?.email && emailTrimmed.toLowerCase() === user.email.toLowerCase()) {
        newErrors.partnerEmail = "You can't invite yourself";
      }
    }

    if (!termsText.trim()) {
      newErrors.termsText = 'Terms cannot be empty';
    }

    setErrors(newErrors);

    // Focus the partner name input on validation error (ARIA / UX requirement)
    if (newErrors.partnerName) {
      // The input is inside the certificate — find via aria-label
      const input = document.querySelector<HTMLInputElement>('input[aria-label="Partner\'s full name"]');
      input?.focus();
    }

    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !user?.id) return;

    setIsSubmitting(true);
    setSubmitError(null);

    analytics.track('agreement_create_started', {
      partner_email_found: lookupResult !== null && lookupResult !== 'not-found',
      visibility,
    });

    try {
      // Check for duplicate active/pending agreement.
      // P878: picker path skips the client email check — create_agreement_with_profile
      // runs the duplicate guard server-side against the resolved email.
      if (!selectedPartner) {
        const hasDuplicate = await agreementsService.hasActiveAgreementWith(
          user.id,
          partnerEmail.trim()
        );
        if (hasDuplicate) {
          analytics.track('agreement_create_failed', { reason: 'duplicate' });
          setErrors((prev) => ({
            ...prev,
            partnerEmail: 'You already have an active agreement with this person',
          }));
          setIsSubmitting(false);
          return;
        }
      }

      const agreement = await agreementsService.createAgreement({
        partnerEmail: partnerEmail.trim(),
        partnerProfileId: selectedPartner?.profileId,
        partnerDisplayName: partnerName.trim(),
        termsText: termsText.trim(),
        visibility,
      });

      if (!agreement) {
        analytics.track('agreement_create_failed', { reason: 'insert_returned_null' });
        setSubmitError('Failed to create agreement. Please try again.');
        setIsSubmitting(false);
        return;
      }

      analytics.track('agreement_create_success', { agreement_id: agreement.id });
      toast.success(`Agreement sent — waiting for ${partnerName.trim()} to co-sign.`);
      navigate(`/p/${creatorSlug ?? user.id}/partners`);
    } catch (err) {
      console.error('Error creating agreement:', err);
      analytics.track('agreement_create_failed', { reason: 'exception', error: String(err) });
      setSubmitError('Failed to create agreement. Please check your connection and try again.');
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <CertificatePageShell className="py-16">
        <div className="flex items-center justify-center">
          <ClarityLoader size="lg" />
        </div>
      </CertificatePageShell>
    );
  }

  if (!session) {
    return null;
  }

  const creatorHasNoName = creatorName !== undefined && !creatorName;

  return (
    <CertificatePageShell className="py-8 pb-24 md:py-12 md:pb-12">
      <Button
        variant="ghost"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 -ml-2 min-h-11 px-3"
        aria-label="Go back"
      >
        <ArrowLeft size={16} />
        Back
      </Button>

      {/* Nameless creator error */}
      {creatorHasNoName && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 mb-6" role="alert">
          Please add your name in{' '}
          <a href="/settings" className="underline font-medium">Settings</a>{' '}
          before creating an agreement.
        </div>
      )}

      {/* Certificate — primary UI (IS the form) */}
      <form onSubmit={handleSubmit}>
        <AgreementCertificate
          variant="creation"
          agreementVersion={CURRENT_AGREEMENT_VERSION}
          creatorName={creatorName ?? ''}
          creatorSignedAt={new Date().toISOString()}
          termsText={termsText}
          termsPlaceholder={TERMS_PLACEHOLDER}
          onPartnerNameChange={handlePartnerNameChange}
          partnerNameValue={partnerName}
          partnerNameError={errors.partnerName}
          partnerNamePlaceholder="Full name of your partner"
          partnerNameReadOnly={isPartnerNameLocked}
          onTermsChange={handleTermsChange}
          termsError={errors.termsText}
          footer={
            <div className="space-y-5">
              {/* Partner Email */}
              <div>
                <label htmlFor="partner-email" className="block text-sm font-medium mb-2">
                  Partner <span className="text-red-500">*</span>
                </label>
                {/* P878: name typeahead over existing relationships; email = first-contact fallback */}
                <ProfilePickerInput
                  id="partner-email"
                  value={partnerEmail}
                  onValueChange={handleEmailChange}
                  selected={selectedPartner}
                  onSelect={handlePartnerSelect}
                  placeholder="Name or email"
                  ariaLabel="Search by name, or enter their email"
                  hasError={!!errors.partnerEmail}
                  isBusy={isLookingUp}
                />

                {!errors.partnerEmail && !selectedPartner && lookupResult === 'not-found' && (
                  <p className="text-sm text-muted-foreground mt-2" role="status">
                    No account found — they&apos;ll be invited to create one.
                  </p>
                )}
                {!errors.partnerEmail && lookupResult !== null && lookupResult !== 'not-found' && (
                  <div className="mt-2" role="status">
                    <p className="text-sm text-green-700 font-medium mb-1">Account found ✓</p>
                    <AvatarBadge party={lookupResult} />
                    {isPartnerNameLocked && (
                      <p className="text-xs text-[#1A1A1A]/50 mt-1">Using their registered name</p>
                    )}
                  </div>
                )}
                {errors.partnerEmail && (
                  <p id="partner-email-error" className="text-sm text-red-500 mt-1" role="alert">
                    {errors.partnerEmail}
                  </p>
                )}
              </div>

              {/* Visibility Selector */}
              <fieldset>
                <legend className="block text-sm font-medium mb-2">Visibility</legend>
                <div className="flex gap-2">
                  {VISIBILITY_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = visibility === opt.value;
                    return (
                      <MobileTooltip key={opt.value} content={opt.tooltip}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => setVisibility(opt.value)}
                          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium transition-colors min-h-11 ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50 text-blue-700'
                              : 'border-input bg-background text-muted-foreground hover:bg-accent'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {opt.label}
                        </button>
                      </MobileTooltip>
                    );
                  })}
                </div>
              </fieldset>

              {/* Submission error */}
              {submitError && (
                <p className="text-sm text-red-500" role="alert">
                  {submitError}
                </p>
              )}

              {/* Submit */}
              <Button
                type="submit"
                disabled={isSubmitting || !!errors.partnerEmail || creatorHasNoName}
                aria-disabled={creatorHasNoName ? 'true' : undefined}
                className="bg-blue-500 hover:bg-blue-600 text-white w-full py-6 text-base"
              >
                {isSubmitting ? (
                  <>
                    <Loader2Icon className="w-4 h-4 animate-spin mr-2" />
                    Sending...
                  </>
                ) : (
                  'Seal & Send \u2726'
                )}
              </Button>
            </div>
          }
        />
      </form>
    </CertificatePageShell>
  );
}

export default CreateAgreementPage;
