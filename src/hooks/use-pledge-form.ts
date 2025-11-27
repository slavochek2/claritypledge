import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createProfile, checkSlugExists, generateSlug } from "@/polymet/data/api";
import { useDebounce } from "@/hooks/use-debounce";
import { triggerConfetti } from "@/lib/confetti";
import type { Profile } from "@/polymet/types";

export function usePledgeForm(onSuccess?: () => void) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [reason, setReason] = useState("");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSealing, setIsSealing] = useState(false);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");
  const [isCheckingName, setIsCheckingName] = useState(false);
  
  const navigate = useNavigate();
  const debouncedName = useDebounce(name, 500);

  useEffect(() => {
    const checkName = async () => {
      if (debouncedName.trim().length < 2) {
        setNameError("");
        return;
      }
      setIsCheckingName(true);
      const slug = generateSlug(debouncedName);
      const exists = await checkSlugExists(slug);
      if (exists) {
        setNameError("This name is already taken. Please choose another one.");
      } else {
        setNameError("");
      }
      setIsCheckingName(false);
    };

    checkName();
  }, [debouncedName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear any previous errors
    setError("");
    
    // Validate required fields
    if (!name.trim() || !email.trim()) {
      setError("Please fill in your name and email to sign the pledge.");
      return;
    }

    if (nameError) {
      setError(nameError);
      return;
    }

    setIsSubmitting(true);
    setIsSealing(true);

    try {
      // Normalize LinkedIn URL - add https:// if missing
      let normalizedLinkedInUrl = linkedinUrl.trim();
      if (normalizedLinkedInUrl && !normalizedLinkedInUrl.match(/^https?:\/\//i)) {
        normalizedLinkedInUrl = `https://${normalizedLinkedInUrl}`;
      }

      // Create the profile in Supabase
      const { slug } = await createProfile(
        name.trim(),
        email.trim(),
        role.trim() || undefined,
        normalizedLinkedInUrl || undefined,
        reason.trim() || undefined
      );

      // Store complete pending profile for useUser hook and optimistic UI
      // This matches the Profile interface to avoid "Profile Not Found" issues
      const pendingProfile: Profile = {
        id: 'pending-' + Date.now(), // Temporary ID
        slug,
        name: name.trim(),
        email: email.trim(),
        role: role.trim() || undefined,
        linkedinUrl: normalizedLinkedInUrl || undefined,
        reason: reason.trim() || undefined,
        signedAt: new Date().toISOString(),
        isVerified: false,
        witnesses: [],
        reciprocations: 0,
        avatarColor: "#0044CC" // Default fallback color
      };
      
      // Store in localStorage
      localStorage.setItem('pendingProfile', JSON.stringify(pendingProfile));
      // Store flag that this is a first-time pledge (for the welcome modal)
      localStorage.setItem('firstTimePledge', 'true');

      // Trigger confetti only on success
      triggerConfetti();
      
      if (onSuccess) {
        onSuccess();
      }
      
      // Redirect to the new profile page
      navigate(`/p/${slug}?firstTime=true`);

    } catch (error) {
      console.error("Error signing pledge:", error);
      
      // Provide more detailed error message
      let errorMessage = "Failed to sign pledge. Please try again.";
      
      if (error instanceof Error) {
        console.error("Error details:", {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
        
        if (error.message === 'USER_EXISTS') {
          errorMessage = "An account with this email already exists. Please log in.";
        } else if (error.message?.includes("Invalid API key")) {
          errorMessage = "Configuration error: Invalid API key. Please contact support.";
        } else if (error.message?.includes("rate limit")) {
          errorMessage = "Too many requests. Please wait a moment and try again.";
        } else if (error.message?.includes("Invalid email")) {
          errorMessage = "Please enter a valid email address.";
        }
      }
      
      setError(errorMessage);
      setIsSubmitting(false);
      setIsSealing(false);
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
      isSealing,
      error,
      nameError,
      isCheckingName
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

