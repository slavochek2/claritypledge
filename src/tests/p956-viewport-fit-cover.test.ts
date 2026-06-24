/**
 * P956 Canary — index.html viewport meta must include `viewport-fit=cover`.
 *
 * Per the CSS Environment Variables spec, `env(safe-area-inset-*)` only
 * resolves to non-zero values when the viewport meta sets `viewport-fit=cover`.
 * Without it, every `pb-[env(safe-area-inset-bottom)]` in the app evaluates to
 * 0 — so in the installed standalone PWA (vite.config.ts `display: 'standalone'`,
 * edge-to-edge on Android 15) the fixed bottom nav and other fixed-bottom UI are
 * clipped behind the system navigation bar (the P956 screenshot).
 *
 * The app already depends on `env(safe-area-inset-bottom)` in six places
 * (bottom-nav, fixed-bottom-bar, live-mode-view ×2, letter-reading-page,
 * EventDetail, sonner). This single meta attribute is the prerequisite that
 * activates all of them. This canary locks that prerequisite in place: removing
 * `viewport-fit=cover` from index.html must make this test fail.
 *
 * This is a static guard rather than a browser canary by necessity — safe-area
 * insets are 0 in headless/desktop browsers regardless of the bug, so a runtime
 * canary cannot reproduce the device-only clipping (see P956 spec, reproduce gate).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadIndexHtml(): string {
  const path = resolve(process.cwd(), 'index.html');
  return readFileSync(path, 'utf-8');
}

function getViewportMetaContent(html: string): string | null {
  // Match the <meta name="viewport" ... content="..."> tag and capture content.
  const tag = html.match(/<meta\s+name=["']viewport["'][^>]*>/i);
  if (!tag) return null;
  const content = tag[0].match(/content=["']([^"']*)["']/i);
  return content ? content[1] : null;
}

describe('P956: viewport meta enables safe-area insets', () => {
  const html = loadIndexHtml();

  it('index.html has a viewport meta tag', () => {
    const content = getViewportMetaContent(html);
    expect(content, 'a <meta name="viewport" content="..."> tag must exist').toBeTruthy();
  });

  it('viewport meta content includes viewport-fit=cover', () => {
    const content = getViewportMetaContent(html);
    expect(content).toBeTruthy();
    expect(
      content!.replace(/\s/g, ''),
      `viewport meta must include viewport-fit=cover so env(safe-area-inset-*) resolves on device. Current value: ${content}`,
    ).toContain('viewport-fit=cover');
  });

  it('existing viewport directives are preserved (no regression)', () => {
    const content = getViewportMetaContent(html);
    expect(content).toBeTruthy();
    const normalized = content!.replace(/\s/g, '');
    // These were present before P956. The fix must not drop them.
    expect(normalized, 'width=device-width must be preserved').toContain('width=device-width');
    expect(normalized, 'initial-scale=1.0 must be preserved').toContain('initial-scale=1');
  });
});
