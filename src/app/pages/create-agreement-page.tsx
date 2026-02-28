/**
 * @file create-agreement-page.tsx
 * @description P422: Create Clarity Partner Agreement page.
 * Route: /agreements/new
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth';
import { supabase } from '@/lib/supabase';
import { agreementsService } from '@/app/data/agreements-service';
import type { AgreementParty, AgreementVisibility } from '@/app/data/agreements-service';
import { Loader2Icon, GlobeIcon, LockIcon, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { MobileTooltip } from '@/app/components/shared/mobile-tooltip';

const TERMS_MAX = 1000;

const DEFAULT_TERMS = `Scope: Professional partnership — all work-related communication.
Session duration: Minimum 15 minutes per /live session.
Frequency: At least [X] /live session(s) per [month/quarter].
First session: We commit to completing a /live session within 30 days of signing.
Response time: Session requests must be acknowledged within 14 days.
Channel: Session requests via ClarityPledge only.
Renewal: This agreement auto-renews until either party terminates.`;

const VISIBILITY_OPTIONS: {
  value: AgreementVisibility;
  icon: typeof GlobeIcon;
  label: string;
  tooltip: string;
}[] = [
  { value: 'private', icon: LockIcon, label: 'Private', tooltip: 'Only you and your partner can view this agreement.' },
  { value: 'public', icon: GlobeIcon, label: 'Public', tooltip: 'Anyone can view this agreement.' },
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
  const [partnerEmail, setPartnerEmail] = useState('');
  const [visibility, setVisibility] = useState<AgreementVisibility>('private');
  const [termsText, setTermsText] = useState(DEFAULT_TERMS);

  // Lookup state
  const [lookupResult, setLookupResult] = useState<AgreementParty | null | 'not-found'>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Validation errors
  const [errors, setErrors] = useState<{
    partnerEmail?: string;
    termsText?: string;
  }>({});

  // Creator name check (nameless users cannot create agreements)
  const [creatorName, setCreatorName] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!user?.id) return;
    supabase.from('profiles').select('name').eq('id', user.id).single()
      .then(({ data }) => setCreatorName(data?.name ?? ''));
  }, [user?.id]);

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !session) {
      navigate('/login');
    }
  }, [authLoading, session, navigate]);

  // Debounced email lookup
  const handleEmailChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const email = e.target.value;
      setPartnerEmail(email);
      setLookupResult(null);
      setErrors((prev) => ({ ...prev, partnerEmail: undefined }));
      setSubmitError(null);

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
          setLookupResult(party ?? 'not-found');
        } finally {
          setIsLookingUp(false);
        }
      }, 400);
    },
    [user?.email]
  );

  const handleTermsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    if (val.length <= TERMS_MAX) {
      setTermsText(val);
    }
    if (errors.termsText && val.trim()) {
      setErrors((prev) => ({ ...prev, termsText: undefined }));
    }
  };

  const validate = (): boolean => {
    const newErrors: { partnerEmail?: string; termsText?: string } = {};

    const emailTrimmed = partnerEmail.trim();
    if (!emailTrimmed) {
      newErrors.partnerEmail = 'Partner email is required';
    } else if (user?.email && emailTrimmed.toLowerCase() === user.email.toLowerCase()) {
      newErrors.partnerEmail = "You can't invite yourself";
    }

    if (!termsText.trim()) {
      newErrors.termsText = 'Terms cannot be empty';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !user?.id) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Check for duplicate active/pending agreement
      const hasDuplicate = await agreementsService.hasActiveAgreementWith(
        user.id,
        partnerEmail.trim()
      );
      if (hasDuplicate) {
        setErrors((prev) => ({
          ...prev,
          partnerEmail: 'You already have an active agreement with this person',
        }));
        setIsSubmitting(false);
        return;
      }

      const agreement = await agreementsService.createAgreement({
        partnerEmail: partnerEmail.trim(),
        termsText: termsText.trim(),
        visibility,
      });

      if (!agreement) {
        setSubmitError('Failed to create agreement. Please try again.');
        setIsSubmitting(false);
        return;
      }

      navigate(`/agreements/${agreement.id}`);
    } catch (err) {
      console.error('Error creating agreement:', err);
      setSubmitError('Failed to create agreement. Please check your connection and try again.');
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <div className="flex items-center justify-center">
          <Loader2Icon className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8 pb-24 md:py-12 md:pb-12 max-w-2xl">
      <Button
        variant="ghost"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 -ml-2 min-h-[44px] px-3"
        aria-label="Go back"
      >
        <ArrowLeft size={16} />
        Back
      </Button>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">New Clarity Partner Agreement</h1>
        <p className="text-muted-foreground mt-2">
          Invite someone to practice calibrated communication with you.
        </p>
      </div>

      {/* Nameless creator error */}
      {creatorName !== undefined && !creatorName && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          Please add your name in{' '}
          <a href="/settings" className="underline font-medium">Settings</a>{' '}
          before creating an agreement.
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Partner Email */}
        <div>
          <label htmlFor="partner-email" className="block text-sm font-medium mb-2">
            Partner email <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Input
              id="partner-email"
              type="email"
              value={partnerEmail}
              onChange={handleEmailChange}
              placeholder="partner@example.com"
              aria-describedby={errors.partnerEmail ? 'partner-email-error' : undefined}
              aria-invalid={errors.partnerEmail ? 'true' : undefined}
              className={errors.partnerEmail ? 'border-red-500' : ''}
              autoComplete="email"
            />
            {isLookingUp && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2Icon className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Lookup result */}
          {!errors.partnerEmail && lookupResult === 'not-found' && (
            <p className="text-sm text-muted-foreground mt-2">
              No account found — they&apos;ll be invited to create one.
            </p>
          )}
          {!errors.partnerEmail && lookupResult !== null && lookupResult !== 'not-found' && (
            <div className="mt-2">
              <p className="text-sm text-green-700 font-medium mb-1">Account found ✓</p>
              <AvatarBadge party={lookupResult} />
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
          <div className="flex gap-2" role="radiogroup" aria-label="Agreement visibility">
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
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-md border text-sm font-medium transition-colors min-h-[44px] ${
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

        {/* Terms Text */}
        <div>
          <label htmlFor="terms-text" className="block text-sm font-medium mb-2">
            Our terms:
          </label>
          <Textarea
            id="terms-text"
            value={termsText}
            onChange={handleTermsChange}
            rows={8}
            aria-describedby={errors.termsText ? 'terms-error' : 'terms-hint'}
            aria-invalid={errors.termsText ? 'true' : undefined}
            className={`resize-y min-h-[180px] font-mono text-sm ${errors.termsText ? 'border-red-500' : ''}`}
            placeholder="Describe the terms of your partnership..."
          />
          <div className="flex justify-between items-center mt-1">
            <span id="terms-hint" className="text-xs text-muted-foreground">
              {termsText.length}/{TERMS_MAX} characters
            </span>
          </div>
          {errors.termsText && (
            <p id="terms-error" className="text-sm text-red-500 mt-1" role="alert">
              {errors.termsText}
            </p>
          )}
        </div>

        {/* Submission error */}
        {submitError && (
          <p className="text-sm text-red-500" role="alert">
            {submitError}
          </p>
        )}

        {/* Submit */}
        <div className="pt-4">
          <Button
            type="submit"
            disabled={isSubmitting || !!errors.partnerEmail || (creatorName !== undefined && !creatorName)}
            className="bg-blue-500 hover:bg-blue-600 text-white min-h-[44px]"
          >
            {isSubmitting ? (
              <>
                <Loader2Icon className="w-4 h-4 animate-spin mr-2" />
                Sending...
              </>
            ) : (
              'Create & Send Invitation \u2736'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

export default CreateAgreementPage;
