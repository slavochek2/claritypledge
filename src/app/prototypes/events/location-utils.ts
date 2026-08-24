// Location classification for event forms and display

export type LocationType = 'virtual' | 'maps' | 'address';

export interface LocationHint {
  level: 'warning' | 'info';
  text: string;
}

export interface LocationClassification {
  type: LocationType;
  /** The URL to use as the link href */
  href: string;
  hint?: LocationHint;
}

const VIRTUAL_HOSTS = [
  'zoom.us',
  'meet.google.com',
  'teams.microsoft.com',
  'teams.live.com',
  'webex.com',
  'whereby.com',
  'around.co',
  'bluejeans.com',
  'gotomeeting.com',
  'discord.gg',
  'discord.com',
];

const MAPS_PATTERNS = [
  /^https?:\/\/(www\.)?google\.com\/maps/i,
  /^https?:\/\/maps\.google\.com/i,
  /^https?:\/\/goo\.gl\/maps/i,
  /^https?:\/\/maps\.app\.goo\.gl/i,
];

const VAGUE_PATTERNS = /^(tbd|online|virtual|to be announced|tba|remote|zoom|meet|teams)$/i;

// Looks like a URL but missing the protocol
const MISSING_PROTOCOL = /^([\w-]+\.)+[\w-]+(\/|$)/;

// Has a protocol but it's garbled (htp, htps, hhttps, etc.)
const MALFORMED_PROTOCOL = /^h[a-z]{1,4}s?:\/\//i;

export function classifyLocation(raw: string): LocationClassification {
  const location = raw.trim();

  // --- Warning: missing https:// ---
  if (!location.startsWith('http') && MISSING_PROTOCOL.test(location)) {
    // Looks like a URL without protocol
    const isVirtualHost = VIRTUAL_HOSTS.some(h => location.toLowerCase().startsWith(h));
    return {
      type: isVirtualHost ? 'virtual' : 'address',
      href: buildMapsSearchUrl(location),
      hint: {
        level: 'warning',
        text: 'Looks like a link — add https:// so attendees can open it',
      },
    };
  }

  // --- Warning: malformed protocol (htps://, htp://, hhttps://) ---
  if (MALFORMED_PROTOCOL.test(location) && !location.startsWith('https://') && !location.startsWith('http://')) {
    return {
      type: 'address',
      href: buildMapsSearchUrl(location),
      hint: {
        level: 'warning',
        text: 'URL looks malformed — double-check the link',
      },
    };
  }

  // --- Valid URL path ---
  if (location.startsWith('https://') || location.startsWith('http://')) {
    // Check for Maps URLs first
    if (MAPS_PATTERNS.some(p => p.test(location))) {
      return { type: 'maps', href: location };
    }

    // Check for virtual meeting platforms
    try {
      const url = new URL(location);
      const host = url.hostname.replace(/^www\./, '');
      if (VIRTUAL_HOSTS.some(h => host === h || host.endsWith('.' + h))) {
        return { type: 'virtual', href: location };
      }
    } catch {
      // invalid URL — fall through to address
    }

    // Any other valid URL — use directly as a link (don't wrap in Maps)
    return { type: 'address', href: location };
  }

  // --- Info: vague placeholder ---
  if (VAGUE_PATTERNS.test(location)) {
    return {
      type: 'address',
      href: buildMapsSearchUrl(location),
      hint: {
        level: 'info',
        text: 'Add a specific address or link so attendees can find you',
      },
    };
  }

  // --- Plain text address ---
  return { type: 'address', href: buildMapsSearchUrl(location) };
}

/** Returns href only when scheme is http/https — prevents javascript: XSS if location value is user-controlled. */
export function safeLinkHref(href: string): string | undefined {
  return /^https?:/i.test(href) ? href : undefined;
}

export function getLocationDisplayLabel(classification: LocationClassification, raw: string): string {
  if (classification.type === 'maps') return 'View on Maps';
  if (classification.type === 'virtual') return 'Join online';
  if (raw.startsWith('http')) return 'View venue';
  return raw;
}

function buildMapsSearchUrl(query: string): string {
  // A PIN for the place, not a route from wherever the viewer happens to be.
  // Until 2026-08-24 this built `/maps/dir/Current+Location/<query>` -- a
  // directions URL -- despite the name saying "search". Every event page
  // therefore showed attendees a driving route from their current position
  // instead of showing them where the event is. Nobody browsing an event has
  // asked for turn-by-turn yet; they want to see where it is.
  // `?api=1&query=` is Google's documented, stable place-search form.
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
