import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generate initials from a full name (e.g., "John Doe" -> "JD")
 * Returns up to 2 uppercase characters. Returns "?" for empty/undefined names.
 */
export function getInitials(fullName?: string): string {
  if (!fullName?.trim()) return "?";
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Generate a Gravatar URL for an email address using SHA-256 hash.
 * Gravatar supports SHA-256 as an alternative to MD5.
 * Returns undefined if email is not provided or if crypto API is unavailable.
 */
export async function getGravatarUrl(email?: string, size = 160): Promise<string | undefined> {
  if (!email?.trim()) return undefined;

  try {
    // crypto.subtle requires secure context (HTTPS or localhost)
    if (!crypto?.subtle) return undefined;

    const msgBuffer = new TextEncoder().encode(email.trim().toLowerCase());
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return `https://www.gravatar.com/avatar/${hashHex}?s=${size}&d=404`;
  } catch {
    // Crypto API unavailable (e.g., non-secure context, unsupported browser)
    return undefined;
  }
}
