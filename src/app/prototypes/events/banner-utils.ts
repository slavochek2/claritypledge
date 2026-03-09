import { supabase } from '@/lib/supabase';

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

/**
 * Generates an AI banner via the generate-event-banner edge function.
 * Returns the public URL of the stored image, or null on failure.
 */
export async function generateAIBanner(
  eventId: string,
  title: string,
  location: string,
  keywords?: string,
): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) return null;

    const response = await fetch(`${supabaseUrl}/functions/v1/generate-event-banner`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ eventId, title, location, keywords }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.url || null;
  } catch {
    return null;
  }
}

interface UnsplashPhoto {
  id: string;
  urls: { regular: string; full: string };
}

interface UnsplashSearchResult {
  results: UnsplashPhoto[];
  total: number;
}

/**
 * Fetches a landscape photo from Unsplash for the given keywords.
 * Returns the first result URL, or null if none found or on error.
 */
export async function fetchUnsplashBanner(keywords: string): Promise<string | null> {
  if (!keywords.trim()) return null;
  const accessKey = import.meta.env.VITE_UNSPLASH_ACCESS_KEY;
  if (!accessKey) return null;

  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keywords)}&orientation=landscape&per_page=5`;
    const res = await fetch(url, { headers: { Authorization: `Client-ID ${accessKey}` } });
    if (!res.ok) return null;
    const data: UnsplashSearchResult = await res.json();
    if (!data.results?.length) return null;
    return data.results[0].urls.regular;
  } catch {
    return null;
  }
}

/**
 * Regenerates a banner by picking a random result from Unsplash (not always first).
 * Returns the selected URL, or null if none found or on error.
 */
export async function regenerateUnsplashBanner(keywords: string): Promise<string | null> {
  if (!keywords.trim()) return null;
  const accessKey = import.meta.env.VITE_UNSPLASH_ACCESS_KEY;
  if (!accessKey) return null;

  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keywords)}&orientation=landscape&per_page=5`;
    const res = await fetch(url, { headers: { Authorization: `Client-ID ${accessKey}` } });
    if (!res.ok) return null;
    const data: UnsplashSearchResult = await res.json();
    if (!data.results?.length) return null;
    const idx = Math.floor(Math.random() * data.results.length);
    return data.results[idx].urls.regular;
  } catch {
    return null;
  }
}
