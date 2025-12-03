import { useState } from "react";
import { createProfile } from "@/app/data/api";
import { triggerConfetti } from "@/lib/confetti";

export function usePledgeForm(onSuccess?: () => void) {
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

    setIsSubmitting(true);

    try {
      let normalizedLinkedInUrl = linkedinUrl.trim();
      if (normalizedLinkedInUrl && !normalizedLinkedInUrl.match(/^https?:\/\//i)) {
        normalizedLinkedInUrl = `https://${normalizedLinkedInUrl}`;
      }

      await createProfile(
        name.trim(),
        email.trim(),
        role.trim() || undefined,
        normalizedLinkedInUrl || undefined,
        reason.trim() || undefined
      );

      // Store email for success page display
      localStorage.setItem('pendingVerificationEmail', email.trim());
      localStorage.setItem('firstTimePledge', 'true');
      triggerConfetti();
      setIsSubmitting(false);

      if (onSuccess) {
        onSuccess();
      }

    } catch (error) {
      console.error("Error signing pledge:", error);
      let errorMessage = "Failed to sign pledge. Please try again.";
      if (error instanceof Error) {
        if (error.message?.includes("rate limit")) {
          errorMessage = "Too many requests. Please wait a moment and try again.";
        } else if (error.message?.includes("Invalid email")) {
          errorMessage = "Please enter a valid email address.";
        }
      }
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

