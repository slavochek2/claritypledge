/**
 * Canary — every route's canonical URL must be its OWN url, not the site root.
 *
 * Root cause it guards: <link rel="canonical"> was rendered inside <Helmet>. React 19
 * extracts <link> from the render tree before react-helmet-async v2 can process it as a
 * child (the same incompatibility already worked around for <meta> via setMeta), so the
 * Helmet canonical never reached the DOM. The only canonical present was the static one
 * in index.html — meaning EVERY route on the site declared its canonical as
 * "https://claritypledge.com/", and no sub-page could rank independently.
 *
 * BEFORE FIX: canonical stays "https://claritypledge.com/" no matter which url is passed.
 * AFTER FIX: setCanonical() updates the existing tag in place, imperatively.
 *
 * The "exactly one canonical" assertion is load-bearing: appending rather than updating
 * would leave index.html's root canonical alongside the new one, and crawlers discard a
 * page with two conflicting canonicals — a silent regression that a naive
 * "does the right href exist?" check would pass.
 */
import { render, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { describe, it, expect, beforeEach } from 'vitest';

import { SEO } from '@/app/components/seo';

const BASE = 'https://claritypledge.com';

function canonicals() {
  return [...document.querySelectorAll('link[rel="canonical"]')];
}

describe('SEO canonical is per-route, not the hardcoded site root', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    // Reproduce index.html's static canonical — the tag that was silently winning.
    const staticTag = document.createElement('link');
    staticTag.setAttribute('rel', 'canonical');
    staticTag.setAttribute('href', `${BASE}/`);
    document.head.appendChild(staticTag);
  });

  it('sets the canonical to the route url, overriding the static root tag', async () => {
    render(<HelmetProvider><SEO title="Co-Founders" url="/founder" /></HelmetProvider>);

    await waitFor(() => {
      expect(canonicals()[0]?.getAttribute('href')).toBe(`${BASE}/founder`);
    });
  });

  it('leaves exactly ONE canonical tag — never appends a second', async () => {
    render(<HelmetProvider><SEO title="Coaches" url="/coach" /></HelmetProvider>);

    await waitFor(() => {
      expect(canonicals()[0]?.getAttribute('href')).toBe(`${BASE}/coach`);
    });
    expect(canonicals()).toHaveLength(1);
  });

  it('a route passing no url canonicalises to the site root', async () => {
    render(<HelmetProvider><SEO title="Something" /></HelmetProvider>);

    await waitFor(() => {
      expect(canonicals()[0]?.getAttribute('href')).toBe(BASE);
    });
    expect(canonicals()).toHaveLength(1);
  });
});
