const NOISE_WORDS = new Set([
  'clarity', 'lab', 'session', 'workshop', 'event',
  'the', 'a', 'an', 'in', 'on', 'at', 'of', 'and', 'or', 'for', 'with',
]);

/**
 * Extracts meaningful keywords from an event title for Unsplash image search.
 * Strips noise words, hashtag+number patterns, and standalone numbers.
 */
export function extractBannerKeywords(title: string): string {
  return title
    .trim()
    .replace(/#\d+/g, '')           // strip #1, #2, etc.
    .replace(/\b\d+\b/g, '')        // strip standalone numbers
    .split(/\s+/)
    .filter((word) => {
      const lower = word.toLowerCase().replace(/[^a-z]/g, '');
      return lower.length > 0 && !NOISE_WORDS.has(lower);
    })
    .join(' ')
    .trim();
}
