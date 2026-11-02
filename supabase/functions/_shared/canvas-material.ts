/**
 * P1536: what the canvas engine will fetch and keep: links (https only, every redirect hop re-vetted, at most
 * 3 redirects, 1 MB, 8 s for the whole chain), uploads (decoded or extracted in memory; only text leaves) and
 * the caps on both. Pure and dependency-free, so vitest loads it. Addresses are vetted in canvas-hosts.ts.
 *
 * Nothing here stores anything.
 */

import { hostIsPublic, type Resolver } from './canvas-hosts.ts';
import { anySignal } from './abort-signals.ts';

// ── Caps (blueprint section 6) ──────────────────────────────────────────────

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Multipart framing allowance on top of the file itself. */
export const MULTIPART_SLACK_BYTES = 1024 * 1024;

/** Upload gate, checked before any body byte is read: without a plain declared length the runtime would
 *  buffer an unbounded chunked body inside req.formData(), so the size cap could be bypassed. */
export function uploadLengthRefusal(header: string | null): 'missing' | 'too_large' | null {
  if (header === null || !/^[0-9]+$/.test(header)) return 'missing';
  return Number(header) > MAX_UPLOAD_BYTES + MULTIPART_SLACK_BYTES ? 'too_large' : null;
}
/** Extracted or decoded text kept per material item. */
export const MAX_STORED_TEXT_CHARS = 200_000;
export const MAX_MATERIAL_ITEMS = 10;
export const MAX_LINKS_PER_RUN = 5;
export const MAX_LINK_BYTES = 1024 * 1024;
export const LINK_TIMEOUT_MS = 8_000;
export const MAX_REDIRECTS = 3;
/** A page that turns into less text than this had nothing to read (a login wall, a script shell). */
const MIN_LINK_TEXT_CHARS = 20;

// ── Links ───────────────────────────────────────────────────────────────────

const RAW_TEXT_TAGS = ['script', 'style', 'noscript', 'template'] as const;

/** The raw-text element that opens at `at` (`<script`, any case), or null. */
function rawTextTagAt(html: string, at: number): (typeof RAW_TEXT_TAGS)[number] | null {
  for (const name of RAW_TEXT_TAGS) if (html.slice(at + 1, at + 1 + name.length).toLowerCase() === name) return name;
  return null;
}

/** Where the closer `</name  >` of a raw-text element ends (the index after its `>`), searching from `from`; -1 when there is none. */
function rawTextCloseEnd(html: string, name: string, from: number): number {
  for (let at = html.indexOf('</', from); at >= 0; at = html.indexOf('</', at + 2)) {
    if (html.slice(at + 2, at + 2 + name.length).toLowerCase() !== name) continue;
    let k = at + 2 + name.length;
    while (k < html.length && /\s/.test(html.charAt(k))) k++;
    if (html[k] === '>') return k + 1;
  }
  return -1;
}

/**
 * The visible text of a page: raw-text elements (script, style, noscript, template), comments and tags dropped, the common entities decoded. ONE left-to-right scan
 * with indexOf, never a regular expression over the body: `<[^>]*>` and `<!--[\s\S]*?-->` retry from every `<` that has no closer, which is quadratic on a hostile page
 * of a few hundred KB and holds the function in one synchronous call that no deadline can interrupt. Here every search that fails is remembered, so each `<` costs a
 * bounded amount and the whole scan is linear in the page.
 */
export function htmlToText(html: string): string {
  const parts: string[] = [];
  const noCloser = new Set<string>();
  const lastGt = html.lastIndexOf('>');
  let noComment = false;
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0 || lt > lastGt) { parts.push(html.slice(i)); break; }   // no `>` is left: nothing after `i` can be a tag, a comment or a raw-text element
    parts.push(html.slice(i, lt));
    if (!noComment && html.startsWith('<!--', lt)) {
      const end = html.indexOf('-->', lt + 4);
      if (end >= 0) { parts.push(' '); i = end + 3; continue; }
      noComment = true;
    }
    const raw = rawTextTagAt(html, lt);
    if (raw && !noCloser.has(raw)) {
      const end = rawTextCloseEnd(html, raw, lt + 1);
      if (end >= 0) { parts.push(' '); i = end; continue; }
      noCloser.add(raw);
    }
    parts.push(' ');
    i = html.indexOf('>', lt + 1) + 1;
  }
  return parts.join('')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

const URL_FIND = /\bhttps?:\/\/[^\s<>"'`]+|\bwww\.[^\s<>"'`]+/gi;

/** Links in a piece of text, in order of first appearance, without trailing punctuation. */
export function extractUrls(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(URL_FIND)) {
    let end = m[0].length;
    while (end > 0 && '.,;:!?)]}'.includes(m[0].charAt(end - 1))) end--;   // trailing punctuation, one backward scan (a regex here retries from every start of a long run)
    let u = m[0].slice(0, end);
    if (/^www\./i.test(u)) u = `https://${u}`;
    if (u.length > 2000 || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

export type LinkFailure =
  | 'invalid' | 'not_https' | 'blocked' | 'too_many_redirects' | 'unreachable' | 'http_error' | 'not_text' | 'empty';

export type LinkResult = { ok: true; text: string } | { ok: false; reason: LinkFailure };

const FAILURE_TEXT: Record<LinkFailure, string> = {
  invalid: 'not a web address I can use',
  not_https: 'not an https link',
  blocked: 'not a public web address',
  too_many_redirects: 'it redirected too many times',
  unreachable: 'it did not answer in time',
  http_error: 'the site refused or had no page',
  not_text: 'not a page of text',
  empty: 'nothing readable on it (it may need a login)',
};
export const linkFailureText = (r: LinkFailure): string => FAILURE_TEXT[r];

export interface LinkDeps {
  fetch: (url: URL, init: RequestInit) => Promise<Response>;
  resolve: Resolver;
  timeoutMs?: number;
  /** The run's deadline, on top of this read's own timeout. */
  signal?: AbortSignal;
  maxBytes?: number;
  maxRedirects?: number;
}

type Hop = { next: URL } | { result: LinkResult };

/** One response: a redirect to follow, or the final answer. */
async function answerFor(res: Response, url: URL, maxBytes: number): Promise<Hop> {
  const fail = async (reason: LinkFailure): Promise<Hop> => {
    await res.body?.cancel().catch(() => {});
    return { result: { ok: false, reason } };
  };
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location');
    if (!loc) return await fail('http_error');
    await res.body?.cancel().catch(() => {});
    try { return { next: new URL(loc, url) }; } catch { return { result: { ok: false, reason: 'invalid' } }; }
  }
  if (!res.ok) return await fail('http_error');
  const type = res.headers.get('content-type') ?? '';
  if (!/^(text\/|application\/xhtml)/i.test(type)) return await fail('not_text');
  return { result: await readPage(res, type, maxBytes) };
}

async function readPage(res: Response, type: string, maxBytes: number): Promise<LinkResult> {
  const reader = res.body?.getReader();
  if (!reader) return { ok: false, reason: 'empty' };
  const decoder = new TextDecoder();
  let body = '';
  let size = 0;
  try {
    while (size < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      const chunk = value.subarray(0, maxBytes - size); // one large chunk must not overshoot the cap
      body += decoder.decode(chunk, { stream: true });
      size += chunk.byteLength;
    }
  } catch { return { ok: false, reason: 'unreachable' }; }
  await reader.cancel().catch(() => {});
  const text = (/html/i.test(type) ? htmlToText(body) : body.replace(/\s+/g, ' ').trim()).slice(0, MAX_STORED_TEXT_CHARS);
  return text.length >= MIN_LINK_TEXT_CHARS ? { ok: true, text } : { ok: false, reason: 'empty' };
}

/** A hop is refused for its scheme, port, credentials or host, before anything is fetched. */
async function refusalFor(url: URL, resolve: Resolver): Promise<LinkFailure | null> {
  if (url.protocol !== 'https:') return 'not_https';
  if (url.username || url.password || (url.port && url.port !== '443')) return 'blocked';
  return (await hostIsPublic(url.hostname, resolve)) ? null : 'blocked';
}

/**
 * Read one link's text. Every hop (the first URL and each redirect target) is vetted before it is fetched;
 * redirects are never followed by the fetch itself. One deadline covers the whole chain and the body.
 */
export async function readLinkText(raw: string, deps: LinkDeps): Promise<LinkResult> {
  const maxRedirects = deps.maxRedirects ?? MAX_REDIRECTS;
  const signal = anySignal(deps.signal, AbortSignal.timeout(deps.timeoutMs ?? LINK_TIMEOUT_MS));
  let url: URL;
  try { url = new URL(raw); } catch { return { ok: false, reason: 'invalid' }; }
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const refused = await refusalFor(url, deps.resolve);
    if (refused) return { ok: false, reason: refused };
    let res: Response;
    try {
      res = await deps.fetch(url, {
        redirect: 'manual', signal,
        headers: { 'User-Agent': 'ClarityPledgeCanvasDraft/1', Accept: 'text/html,text/plain,text/markdown' },
      });
    } catch { return { ok: false, reason: 'unreachable' }; }
    const answer = await answerFor(res, url, deps.maxBytes ?? MAX_LINK_BYTES);
    if ('result' in answer) return answer.result;
    url = answer.next;
  }
  return { ok: false, reason: 'too_many_redirects' };
}

// ── Uploads ─────────────────────────────────────────────────────────────────

export const EXTRACT_MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const EXTRACT_MIMES = new Set(Object.values(EXTRACT_MIME_BY_EXT));
const TEXT_MIME = /^(text\/(plain|markdown|csv|x-markdown)|application\/json)$/i;
const TEXT_EXT = /\.(md|markdown|txt|csv|json)$/i;

export type UploadClass = { kind: 'text' } | { kind: 'extract'; mime: string } | { kind: 'unsupported' };

/** How an uploaded file becomes text: decoded as it is, read by one extraction call, or not accepted. */
export function classifyUpload(name: string, mime: string): UploadClass {
  const m = mime.split(';')[0].trim().toLowerCase();
  const ext = (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase();
  if (TEXT_MIME.test(m) || TEXT_EXT.test(name)) return { kind: 'text' };
  if (EXTRACT_MIMES.has(m)) return { kind: 'extract', mime: m };
  const byExt = EXTRACT_MIME_BY_EXT[ext];
  if (byExt && (m === '' || m === 'application/octet-stream')) return { kind: 'extract', mime: byExt };
  return { kind: 'unsupported' };
}

/** A file name as a label: no path, no control characters, at most 120 characters. */
export function cleanLabel(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const label = Array.from(base.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 120).join('');
  return label || 'file';
}

/** Bytes as text, cut to the stored cap, with NUL characters removed. */
export function decodeUploadText(bytes: Uint8Array): string {
  // eslint-disable-next-line no-control-regex
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/\u0000/g, '').trim().slice(0, MAX_STORED_TEXT_CHARS);
}
