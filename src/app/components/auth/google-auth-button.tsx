/**
 * @file google-auth-button.tsx
 * @description P63: Reusable Google OAuth sign-in button component.
 * Follows the UX spec design with branded Google styling.
 *
 * Note: Unlike magic link signup (which collects name first), Google OAuth
 * gets the user's name from their Google profile. This is intentional -
 * Google users get their Google name, while magic link users can customize.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { signInWithGoogle } from "@/app/data/api";
import { analytics } from "@/lib/mixpanel";

interface GoogleAuthButtonProps {
  /** Context for analytics tracking (e.g., 'live', 'login') */
  context: string;
  /** P64: Source for auth callback routing ('login', 'signup', or 'pledge') */
  source?: 'login' | 'signup' | 'pledge';
  /** P76: Redirect URL after auth completes */
  redirect?: string;
  /** P76: Action to perform after auth (e.g., 'rsvp') */
  action?: string;
  /** Additional class names */
  className?: string;
  /** Whether button is disabled */
  disabled?: boolean;
}

/**
 * Google "G" logo SVG - official brand colors
 */
function GoogleLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M17.64 9.20443C17.64 8.56625 17.5827 7.95262 17.4764 7.36353H9V10.8449H13.8436C13.635 11.9699 13.0009 12.9231 12.0477 13.5613V15.8194H14.9564C16.6582 14.2526 17.64 11.9453 17.64 9.20443Z"
        fill="#4285F4"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 9 14.4204C6.65591 14.4204 4.67182 12.8372 3.96409 10.71H0.957275V13.0418C2.43818 15.9831 5.48182 18 9 18Z"
        fill="#34A853"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.96409 10.7101C3.78409 10.1701 3.68182 9.59325 3.68182 9.00007C3.68182 8.40689 3.78409 7.83007 3.96409 7.29007V4.95825H0.957273C0.347727 6.17325 0 7.54780 0 9.00007C0 10.4523 0.347727 11.8269 0.957273 13.0419L3.96409 10.7101Z"
        fill="#FBBC05"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65591 3.57955 9 3.57955Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function GoogleAuthButton({ context, source, redirect, action, className = "", disabled = false }: GoogleAuthButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setIsLoading(true);
    setError(null);
    analytics.track('google_auth_initiated', { context, source, redirect, action });

    const { error: authError } = await signInWithGoogle(source, { redirect, action });

    if (authError) {
      console.error('Google auth error:', authError);
      analytics.track('google_auth_error', { context, error: authError.message });
      setError('Unable to connect to Google. Please try again.');
      setIsLoading(false);
    }
    // If successful, user will be redirected to Google OAuth
    // No need to reset loading state as page will navigate away
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        disabled={disabled || isLoading}
        className={`w-full h-11 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-100 dark:border-gray-600 font-medium ${className}`}
      >
        <GoogleLogo className="mr-3" />
        {isLoading ? "Redirecting..." : "Continue with Google"}
      </Button>
      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}
    </div>
  );
}
