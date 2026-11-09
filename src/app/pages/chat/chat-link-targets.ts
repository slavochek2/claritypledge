/**
 * @file chat-link-targets.ts
 * @description P1652: what a link in chat points at, decided from the PARSED address (never a text match).
 *  - ownAppPath: the router path of an address on the app's own domain (claritypledge.com, its www form, the current origin), or null;
 *  - cardTarget: the letter, story or point such an address names (a card is drawn for it), or null.
 */

import { scanChat } from '@/app/utils/link-scan';

const OWN_HOSTS = ['claritypledge.com', 'www.claritypledge.com'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CardTarget = { kind: 'story' | 'point' | 'letter'; id: string };

function parseHttp(href: string): URL | null {
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

function isOwn(url: URL, currentOrigin: string): boolean {
  if (url.origin === currentOrigin) return true;
  // The app's domain in either form, on the web ports only (a different port is a different service).
  return OWN_HOSTS.includes(url.hostname.toLowerCase()) && url.port === '';
}

/** `/path?query#hash` when the address is on the app itself, else null. */
export function ownAppPath(href: string, currentOrigin: string = window.location.origin): string | null {
  const url = parseHttp(href);
  if (!url || url.username || url.password || !isOwn(url, currentOrigin)) return null;
  // `//host` would navigate off the app (the parser already turns a typed backslash into a slash); so would the encoded forms, once decoded downstream.
  if (url.pathname.startsWith('//') || /^\/%(?:5c|2f)/i.test(url.pathname)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The first recognised link of a message's words (others stay links). */
export function firstCardTarget(body: string | null | undefined, spoken: boolean): CardTarget | null {
  if (!body) return null;
  for (const s of scanChat(body, { spoken })) {
    if (s.type !== 'link') continue;
    const target = cardTarget(s.href);
    if (target) return target;
  }
  return null;
}

/** The artifact a full own-domain address names. Only `/story/:id`, `/point/:id` and `/letter/:id/overview` (`/letter/:id` is a delivery id). */
export function cardTarget(href: string): CardTarget | null {
  const url = parseHttp(href);
  if (!url || url.username || url.password || !OWN_HOSTS.includes(url.hostname.toLowerCase()) || url.port !== '') return null;
  const parts = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const [head, id, tail] = parts;
  if (!id || !UUID.test(id)) return null;
  if (parts.length === 2 && (head === 'story' || head === 'point')) return { kind: head, id };
  if (parts.length === 3 && head === 'letter' && tail === 'overview') return { kind: 'letter', id };
  return null;
}
