import { useEffect } from "react";
import { useParams, Navigate } from "react-router-dom";
import { resolveShortLink } from "@/app/data/short-links";
import { ClarityPageLoader } from "@/components/ui/clarity-loader";

/**
 * Redirect component for short links (/s/:code)
 *
 * Looks up the code in the short links mapping and redirects.
 * Uses window.location for redirects with hash fragments.
 */
export function ShortLinkRedirect() {
  const { code } = useParams<{ code: string }>();

  const target = code ? resolveShortLink(code) : null;

  useEffect(() => {
    if (target) {
      // Use window.location to properly handle hash fragments
      // React Router's Navigate doesn't scroll to hash targets correctly
      window.location.href = target;
    }
  }, [target]);

  // If no target found, redirect to home
  if (!target) {
    return <Navigate to="/" replace />;
  }

  // Show brief loading state while redirect happens
  return <ClarityPageLoader />;
}
