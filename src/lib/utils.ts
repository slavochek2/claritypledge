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

/**
 * Copy text to clipboard with fallback for older browsers.
 * Uses modern Clipboard API when available, falls back to execCommand.
 * @returns true if copy succeeded, false otherwise
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers or non-secure contexts
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textArea);
      return success;
    }
  } catch {
    return false;
  }
}

/**
 * Format a date string as relative time (e.g., "5m ago", "2h ago", "3d ago").
 * Falls back to localized date format for dates older than 7 days.
 */
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}
