import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { isSystemTag } from '@/lib/feed-utils'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Generate initials from a full name (e.g., "John Doe" -> "JD")
 * Returns up to 2 uppercase characters. Returns "?" for empty/undefined names.
 */
/**
 * Strips the reserved "Agent ·" prefix from an agent account's display name.
 *
 * P1104: every agent account is named `Agent · {subject}`, so `getInitials` read the leading
 * "Agent" as the first name and produced "AR" for `Agent · Jordan Rivera` — and "A" plus one
 * letter for EVERY agent in the product. Half the monogram carried no information, and at row
 * size agents stopped being distinguishable from each other.
 *
 * The subject's initials are used instead. That the row is a machine reading is already carried
 * by four other channels — the square silhouette, the drained colour, the missing pledge ring,
 * and the name itself — so the avatar's remaining job is saying WHICH reading this is.
 *
 * Tolerant of the separator because the display name is data: the DB guard normalises what may
 * be RESERVED, not what must be RENDERED, so a name may reach here with any separator glyph or
 * none. Falls back to the original string when stripping would leave nothing.
 */
export function stripAgentPrefix(name?: string): string | undefined {
  if (!name?.trim()) return name;
  // (?![\p{L}\p{N}]) is load-bearing: without it "Agentic Systems" matched the leading "Agent"
  // and became "ic Systems". The prefix only counts when the word ENDS there.
  const stripped = name.replace(/^\s*agent(?![\p{L}\p{N}])\s*[^\p{L}\p{N}\s]*\s*/iu, '');
  return stripped.trim() ? stripped : name;
}

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

export async function shareOrCopy(
  title: string,
  url: string
): Promise<'shared' | 'copied' | 'dismissed' | 'failed'> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url });
      return 'shared';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'dismissed';
      // non-abort native-share error — fall through to clipboard
    }
  }
  const copied = await copyToClipboard(url);
  return copied ? 'copied' : 'failed';
}

/**
 * Generate a consistent avatar background color from a name.
 * Uses the sum of character codes to deterministically pick from a palette.
 * @param name - The name to generate color from
 * @param customColor - Optional custom color to use instead (pass-through)
 * @returns Tailwind CSS class for background color (e.g., "bg-blue-500")
 */
export function getAvatarColor(name: string, customColor?: string): string {
  if (customColor) return customColor;

  const colors = [
    "bg-blue-500",
    "bg-purple-500",
    "bg-green-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-teal-500",
    "bg-indigo-500",
    "bg-red-500",
  ];

  const index = name
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[index % colors.length];
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

/**
 * Strip hashtag strings from content text when they match entries in a tags array.
 * Used to avoid rendering tags twice — once as raw `#hashtag` in text and once as TagPill components.
 *
 * Uses word-boundary-aware matching: `#tag` is stripped only when followed by whitespace,
 * punctuation, or end-of-string. This prevents `#st7` from stripping part of `#st77`.
 *
 * @param content - The raw content text potentially containing hashtag strings
 * @param tags - Array of tag names (without #) that have structured TagPill components
 * @returns Content with matching hashtag strings removed, trimmed, with collapsed whitespace
 */
/**
 * Extracts hashtags from content text, returning deduplicated lowercase tag names.
 * @param content - Text that may contain #hashtag patterns
 * @returns Array of unique lowercase tag names (without the # prefix)
 */
export function extractHashtags(content: string): string[] {
  const matches = content.match(/#(\w+)/g);
  if (!matches) return [];
  const tags = matches.map(m => m.slice(1).toLowerCase());
  const unique = [...new Set(tags)];
  // P630: Filter out system tags — only user tags flow through auto-extraction
  return unique.filter(t => !isSystemTag(t));
}

/** Extract ALL hashtags including system tags — used by stripHashtags fallback only. */
function extractAllHashtags(content: string): string[] {
  const matches = content.match(/#(\w+)/g);
  if (!matches) return [];
  const tags = matches.map(m => m.slice(1).toLowerCase());
  return [...new Set(tags)];
}

export function stripHashtags(content: string, tags?: string[]): string {
  // P630: Strip user tags from the tags array AND any system-pattern hashtags found in the text.
  // This ensures #st8 #understanding are stripped even when callers only pass user tags.
  const userTags = tags && tags.length > 0 ? tags : extractHashtags(content);
  const systemTagsInText = extractAllHashtags(content).filter(t => isSystemTag(t));
  const effectiveTags = [...new Set([...userTags, ...systemTagsInText])];
  if (effectiveTags.length === 0) return content;

  let result = content;
  for (const tag of effectiveTags) {
    // Match #tag followed by word boundary (whitespace, punctuation, or end-of-string)
    // The (?=[\\s.,;:!?)]|$) lookahead ensures we don't strip partial matches like #st7 from #st77
    const pattern = new RegExp(`#${tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[\\s.,;:!?)]|$)`, 'gi');
    result = result.replace(pattern, '');
  }

  // Collapse multiple spaces into one and trim
  return result.replace(/\s{2,}/g, ' ').trim();
}
