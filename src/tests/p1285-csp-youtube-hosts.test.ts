/**
 * P1285 Canary — CSP must allow the three YouTube hosts the story video player needs.
 *
 * The blocked-embed fallback in story-video-player.tsx is designed for ad blockers
 * and corporate policies. On prod it fired for every reader, because our own CSP was
 * the blocker:
 *
 *   - script-src had no https://www.youtube.com  → loadYouTubeApi() (src/lib/video.ts:221)
 *     never resolves, so the player is reported blocked.
 *   - frame-src had no https://www.youtube-nocookie.com → the embed origin
 *     (YOUTUBE_PLAYER_ORIGIN, src/lib/video.ts:49) cannot be framed.
 *   - img-src had no https://i.ytimg.com → the fallback's own thumbnail
 *     (src/lib/video.ts:101) renders as a broken image with alt text.
 *
 * Local dev never sees this — Vite serves no CSP header — which is how it shipped.
 * Same failure family as P805, P863 and P906.
 *
 * Reverting the fix in vercel.json must make this test fail.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface VercelHeader { key: string; value: string }
interface VercelRoute { source: string; headers: VercelHeader[] }
interface VercelConfig { headers?: VercelRoute[] }

function defaultRouteCsp(): string {
  const raw = readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf-8');
  const config = JSON.parse(raw) as VercelConfig;
  const route = config.headers?.find((r) => r.source === '/(.*)');
  const csp = route?.headers.find((h) => h.key === 'Content-Security-Policy');
  return csp?.value ?? '';
}

function extractDirective(csp: string, directiveName: string): string | null {
  const match = csp.match(new RegExp(`(?:^|;)\\s*${directiveName}([^;]+)`));
  return match ? match[1].trim() : null;
}

describe('P1285: CSP allows the YouTube hosts the story player needs', () => {
  const csp = defaultRouteCsp();

  it('vercel.json has an enforcing CSP on the default "/(.*)" route', () => {
    expect(csp, 'enforcing Content-Security-Policy header must exist on /(.*)').toBeTruthy();
  });

  it('script-src allows https://www.youtube.com (the IFrame API script)', () => {
    const value = extractDirective(csp, 'script-src');
    expect(
      value,
      `script-src must include https://www.youtube.com — src/lib/video.ts loads ${'https://www.youtube.com/iframe_api'}. Current value: ${value}`,
    ).toContain('https://www.youtube.com');
  });

  it('frame-src allows the player origin https://www.youtube-nocookie.com', () => {
    const value = extractDirective(csp, 'frame-src');
    expect(
      value,
      `frame-src must include YOUTUBE_PLAYER_ORIGIN. Current value: ${value}`,
    ).toContain('https://www.youtube-nocookie.com');
  });

  it('img-src allows https://i.ytimg.com (the thumbnail in the blocked fallback)', () => {
    const value = extractDirective(csp, 'img-src');
    expect(
      value,
      `img-src must include https://i.ytimg.com or the fallback card shows a broken image. Current value: ${value}`,
    ).toContain('https://i.ytimg.com');
  });

  it('adjacent directives are preserved (no regression while editing the CSP line)', () => {
    expect(extractDirective(csp, 'default-src'), "default-src must remain 'self'").toBe("'self'");
    expect(extractDirective(csp, 'object-src'), "object-src must remain 'none'").toBe("'none'");
    expect(extractDirective(csp, 'frame-ancestors'), "frame-ancestors must remain 'self'").toBe("'self'");
    // P906 must keep passing alongside this fix.
    expect(extractDirective(csp, 'frame-src')).toContain('https://calendar.google.com');
  });
});
