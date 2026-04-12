/**
 * End-of-letter signup form for unauthenticated readers.
 * Shown inline after the reader completes the final point on a one-to-many letter.
 * Not a modal — sits in the content column, below the last point.
 */

import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConsentCheckbox } from '@/app/components/legal/consent-checkbox';

// ============================================================================
// TYPES
// ============================================================================

interface LetterResponseSignupFormProps {
  senderName: string;
  onSubmit: (data: { name: string; email: string }) => Promise<void>;
  onSuccess: () => void;
}

// ============================================================================
// VALIDATION
// ============================================================================

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

// ============================================================================
// COMPONENT
// ============================================================================

export function LetterResponseSignupForm({
  senderName,
  onSubmit,
  onSuccess,
}: LetterResponseSignupFormProps) {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [consentChecked, setConsentChecked] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [showStillWorking, setShowStillWorking] = React.useState(false);
  const [errorBanner, setErrorBanner] = React.useState('');
  const [nameError, setNameError] = React.useState('');
  const [emailError, setEmailError] = React.useState('');

  const stillWorkingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timer on unmount
  React.useEffect(() => {
    return () => {
      if (stillWorkingTimerRef.current) {
        clearTimeout(stillWorkingTimerRef.current);
      }
    };
  }, []);

  // Derived: whether submit button should be enabled
  const canSubmit =
    name.trim().length > 0 &&
    isValidEmail(email) &&
    consentChecked &&
    !isSubmitting;

  function validateFields(): boolean {
    let valid = true;

    if (!name.trim()) {
      setNameError('Name is required');
      valid = false;
    } else {
      setNameError('');
    }

    if (!email.trim()) {
      setEmailError('Email is required');
      valid = false;
    } else if (!isValidEmail(email)) {
      setEmailError('Please enter a valid email address');
      valid = false;
    } else {
      setEmailError('');
    }

    return valid;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!validateFields()) return;
    if (!consentChecked) return;

    setErrorBanner('');
    setIsSubmitting(true);
    setShowStillWorking(false);

    // Start "Still working..." timer
    stillWorkingTimerRef.current = setTimeout(() => {
      setShowStillWorking(true);
    }, 10000);

    try {
      await onSubmit({ name: name.trim(), email: email.trim() });
      onSuccess();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setErrorBanner(message);
    } finally {
      setIsSubmitting(false);
      setShowStillWorking(false);
      if (stillWorkingTimerRef.current) {
        clearTimeout(stillWorkingTimerRef.current);
        stillWorkingTimerRef.current = null;
      }
    }
  }

  return (
    <div className="border border-border bg-muted/50 rounded-md p-4 md:p-5 space-y-4 mt-8 mb-4">
      {/* Heading */}
      <h3 className="text-base font-semibold text-foreground">Save your responses</h3>

      {/* Subtext */}
      <p className="text-sm text-muted-foreground">
        Your name will be shared with {senderName} alongside your responses. We&apos;ll create an
        account so you can come back to this letter and any future ones.
      </p>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Name field */}
        <div className="space-y-1">
          <Label htmlFor="response-name">Name</Label>
          <Input
            id="response-name"
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
            className={nameError ? 'border-red-500' : ''}
            aria-describedby={nameError ? 'response-name-error' : undefined}
          />
          {nameError && (
            <p id="response-name-error" className="text-sm text-red-500">
              {nameError}
            </p>
          )}
        </div>

        {/* Email field */}
        <div className="space-y-1">
          <Label htmlFor="response-email">Email</Label>
          <Input
            id="response-email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isSubmitting}
            className={emailError ? 'border-red-500' : ''}
            aria-describedby={emailError ? 'response-email-error' : undefined}
          />
          {emailError && (
            <p id="response-email-error" className="text-sm text-red-500">
              {emailError}
            </p>
          )}
        </div>

        {/* Consent checkbox */}
        <ConsentCheckbox
          checked={consentChecked}
          onCheckedChange={setConsentChecked}
          disabled={isSubmitting}
          id="response-consent"
        />

        {/* Error banner (above button) */}
        {errorBanner && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-md p-3"
          >
            {errorBanner}
          </div>
        )}

        {/* Submit button */}
        <Button
          type="submit"
          variant="default"
          size="lg"
          className="w-full min-h-[44px]"
          disabled={!canSubmit}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Sending...
            </>
          ) : (
            'Send me the link'
          )}
        </Button>

        {/* Still working... (shown after 10s) */}
        {showStillWorking && (
          <p className="text-sm text-muted-foreground animate-pulse text-center">
            Still working...
          </p>
        )}
      </form>
    </div>
  );
}
