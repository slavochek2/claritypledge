import { useState } from "react";
import { createProfile, updateProfile } from "@/app/data/api";
import { triggerConfetti } from "@/lib/confetti";
import { analytics } from "@/lib/mixpanel";
import type { Profile } from "@/app/data/api";

interface UsePledgeFormOptions {
  onSuccess?: () => void;
  /**
   * P50: Upgrade mode - when an existing user is upgrading to pledger
   * If true, the form will update the profile instead of creating a new one
   */
  isUpgrading?: boolean;
  currentUser?: Profile | null;
}

export function usePledgeForm(options?: UsePledgeFormOptions) {
  const { onSuccess, isUpgrading = false, currentUser = null } = options || {};
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [reason, setReason] = useState("");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // P50: For upgrade flow, skip name/email validation (already verified)
    if (!isUpgrading) {
      if (!name.trim() || !email.trim()) {
        setError("Please fill in your name and email to sign the pledge.");
        return;
      }

      // Validate full name (at least first and last name, each at least 2 characters)
      const nameParts = name.trim().split(/\s+/);
      if (nameParts.length < 2 || nameParts.some(part => part.length < 2)) {
        setError("Please enter your full name (first and last, each at least 2 characters) for the official pledge.");
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        setError("Please enter a valid email address.");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      let normalizedLinkedInUrl = linkedinUrl.trim();
      if (normalizedLinkedInUrl && !normalizedLinkedInUrl.match(/^https?:\/\//i)) {
        normalizedLinkedInUrl = `https://${normalizedLinkedInUrl}`;
      }

      // P50: Upgrade flow - update existing profile instead of creating new one
      if (isUpgrading && currentUser) {
        const { error } = await updateProfile(currentUser.id, {
          role: role.trim() || undefined,
          linkedin_url: normalizedLinkedInUrl || undefined,
          reason: reason.trim() || undefined,
          has_pledged: true,
        });

        if (error) {
          throw error;
        }

        // Track successful pledge upgrade
        analytics.track('pledge_upgrade_completed', {
          has_role: !!role.trim(),
          has_linkedin: !!normalizedLinkedInUrl,
          has_reason: !!reason.trim(),
        });

        triggerConfetti();
        setIsSubmitting(false);

        if (onSuccess) {
          onSuccess();
        }
      } else {
        // Standard flow - new user signing pledge
        await createProfile(
          name.trim(),
          email.trim(),
          role.trim() || undefined,
          normalizedLinkedInUrl || undefined,
          reason.trim() || undefined
        );

        // Track successful pledge submission
        analytics.track('pledge_form_submitted', {
          has_role: !!role.trim(),
          has_linkedin: !!normalizedLinkedInUrl,
          has_reason: !!reason.trim(),
        });

        // Store email for success page display (sessionStorage expires with browser session)
        sessionStorage.setItem('pendingVerificationEmail', email.trim());
        sessionStorage.setItem('firstTimePledge', 'true');
        triggerConfetti();
        setIsSubmitting(false);

        if (onSuccess) {
          onSuccess();
        }
      }

    } catch (error) {
      console.error("Error signing pledge:", error);
      let errorMessage = "Failed to sign pledge. Please try again.";
      let errorType = 'unknown';
      if (error instanceof Error) {
        if (error.message?.includes("rate limit")) {
          errorMessage = "Too many requests. Please wait a moment and try again.";
          errorType = 'rate_limit';
        } else if (error.message?.includes("Invalid email")) {
          errorMessage = "Please enter a valid email address.";
          errorType = 'invalid_email';
        }
      }
      analytics.track('pledge_form_error', { error_type: errorType });
      setError(errorMessage);
      setIsSubmitting(false);
    }
  };

  return {
    formState: {
      name,
      email,
      role,
      linkedinUrl,
      reason,
      isSubmitting,
      error,
    },
    setters: {
      setName,
      setEmail,
      setRole,
      setLinkedinUrl,
      setReason
    },
    handleSubmit
  };
}

