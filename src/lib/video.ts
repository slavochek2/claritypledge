/**
 * P1141 — a story stores exactly one video field: the canonical watch URL.
 * Every other artefact (embed URL, thumbnail, open-at-timestamp link) is
 * re-derived from it here, so no two stored fields can ever disagree.
 *
 * An unrecognized or malformed URL parses to `null`, and every surface treats
 * `null` identically to "this story has no video".
 */

export type VideoProvider = 'youtube';

export interface ParsedVideo {
  provider: VideoProvider;
  videoId: string;
}

/** A quote lifted from the video's captions, with the second it starts at. */
export interface VideoQuote {
  text: string;
  seconds: number;
}

/** The shape of `stories.video_quotes`. */
export interface StoryVideoQuotesData {
  quotes: VideoQuote[];
  durationSeconds: number | null;
}

export const EMPTY_VIDEO_QUOTES: StoryVideoQuotesData = {
  quotes: [],
  durationSeconds: null,
};

/**
 * The enforcement point for which videos a story may reference.
 * Mirrored by the `stories.video_url` CHECK constraint — the UI not exposing
 * an input is not a boundary, so the host allowlist lives in both places.
 */
export const ALLOWED_VIDEO_HOSTS = [
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
] as const;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** The literal origin the player iframe runs on — never `'*'` for postMessage. */
export const YOUTUBE_PLAYER_ORIGIN = 'https://www.youtube-nocookie.com';

/**
 * Parses a canonical watch URL into a provider + video id.
 * Returns `null` for anything not on the host allowlist, anything using a
 * scheme other than http(s), and anything whose id is not well-formed.
 */
export function parseVideoUrl(url: string | null | undefined): ParsedVideo | null {
  if (!url || typeof url !== 'string') return null;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  const host = parsed.hostname.toLowerCase();
  if (!(ALLOWED_VIDEO_HOSTS as readonly string[]).includes(host)) return null;

  let id: string | null = null;

  if (host === 'youtu.be') {
    id = parsed.pathname.slice(1).split('/')[0] || null;
  } else if (parsed.pathname === '/watch') {
    id = parsed.searchParams.get('v');
  } else if (parsed.pathname.startsWith('/embed/')) {
    id = parsed.pathname.slice('/embed/'.length).split('/')[0] || null;
  } else if (parsed.pathname.startsWith('/shorts/')) {
    id = parsed.pathname.slice('/shorts/'.length).split('/')[0] || null;
  } else if (parsed.pathname.startsWith('/live/')) {
    id = parsed.pathname.slice('/live/'.length).split('/')[0] || null;
  }

  if (!id || !YOUTUBE_ID.test(id)) return null;

  return { provider: 'youtube', videoId: id };
}

/** The embed URL the IFrame Player API is pointed at. */
export function getEmbedUrl(url: string | null | undefined): string | null {
  const video = parseVideoUrl(url);
  if (!video) return null;
  return `${YOUTUBE_PLAYER_ORIGIN}/embed/${video.videoId}?enablejsapi=1&rel=0&modestbranding=1`;
}

/** The video's own thumbnail — the story's visual identity everywhere a player cannot run. */
export function getThumbnailUrl(url: string | null | undefined): string | null {
  const video = parseVideoUrl(url);
  if (!video) return null;
  return `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;
}

/**
 * The blocked-player fallback for a timecode: open the source at the second.
 * Non-finite or negative seconds clamp to 0 rather than emitting a broken link.
 */
export function getTimestampUrl(url: string | null | undefined, seconds: number): string | null {
  const video = parseVideoUrl(url);
  if (!video) return null;
  const start = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `https://www.youtube.com/watch?v=${video.videoId}&t=${start}s`;
}

/** `m:ss` under an hour, `mm:ss` past ten minutes — the UI Contract's timecode format. */
export function formatTimecode(seconds: number): string {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/** Normalizes whatever the database returned into the `video_quotes` shape. */
export function normalizeVideoQuotes(raw: unknown): StoryVideoQuotesData {
  if (!raw || typeof raw !== 'object') return EMPTY_VIDEO_QUOTES;
  const value = raw as { quotes?: unknown; durationSeconds?: unknown };
  const quotes = Array.isArray(value.quotes)
    ? value.quotes
        .filter(
          (q): q is VideoQuote =>
            !!q &&
            typeof q === 'object' &&
            typeof (q as VideoQuote).text === 'string' &&
            typeof (q as VideoQuote).seconds === 'number' &&
            Number.isFinite((q as VideoQuote).seconds)
        )
        .map((q) => ({ text: q.text, seconds: Math.max(0, Math.floor(q.seconds)) }))
    : [];
  const durationSeconds =
    typeof value.durationSeconds === 'number' && Number.isFinite(value.durationSeconds)
      ? value.durationSeconds
      : null;
  return { quotes, durationSeconds };
}

let youTubeApiPromise: Promise<void> | null = null;

/**
 * Loads the IFrame Player API once per document.
 * Resolves immediately when `window.YT.Player` already exists.
 */
export function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  const w = window as unknown as { YT?: { Player?: unknown }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve();
  if (youTubeApiPromise) return youTubeApiPromise;

  youTubeApiPromise = new Promise<void>((resolve, reject) => {
    const prior = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prior?.();
      resolve();
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      youTubeApiPromise = null;
      reject(new Error('YouTube IFrame API failed to load'));
    };
    document.head.appendChild(script);
  });

  return youTubeApiPromise;
}

/** Test seam — drops the memoized loader between cases. */
export function __resetYouTubeApiLoader(): void {
  youTubeApiPromise = null;
}
