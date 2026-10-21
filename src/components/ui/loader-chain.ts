/**
 * @file loader-chain.ts
 * @description P1539: continuity between page loaders that replace each other. A .ts file so the
 * component file keeps exporting only components (Fast Refresh).
 */
import { useLayoutEffect, useState } from 'react';

/**
 * P1539: one continuous loading state across loaders that replace each other (route guard loader,
 * LazyRoute fallback, the page's own loader). Each is a different element in the tree, so each remounts
 * and its CSS fade would restart from opacity 0: a visible pulse. A module-level chain remembers when the
 * first loader of the run appeared; a loader that mounts while another is mounted, or within a few ms of
 * one unmounting, starts its animations that far in (negative animation-delay) instead of from zero.
 * The 300ms anti-flash still applies to the first loader of a run.
 */
const CHAIN_GAP_MS = 150;
const loaderChain = { mounted: 0, start: 0, lastUnmount: -Infinity };

/**
 * The index.html splash (#app-shell-loader) is the first loader of a run: it is on screen before React exists.
 * If it was in the document when this module loaded, the first loader React renders while #root is still empty
 * continues it instead of fading in from zero (the splash fades out over 400ms while a fresh loader would wait
 * its 300ms anti-flash: a window where neither is fully visible). 1200ms = the C's draw time, so the mark is
 * already drawn, as it is on the splash.
 */
const SPLASH_SEED_MS = 1200;
const splashAtLoad = typeof document !== 'undefined' && !!document.getElementById('app-shell-loader');

function splashHandoff(): boolean {
  if (!splashAtLoad) return false;
  const root = document.getElementById('root');
  return !!root && root.childElementCount === 0;
}

/** Milliseconds the current loader run has already been going (0 when this loader starts a new run). */
function chainElapsed(): number {
  if (loaderChain.mounted === 0 && splashHandoff()) return SPLASH_SEED_MS;
  const now = performance.now();
  const continuing = loaderChain.mounted > 0 || now - loaderChain.lastUnmount < CHAIN_GAP_MS;
  return continuing ? Math.max(0, now - loaderChain.start) : 0;
}

export function useLoaderChain(): number {
  const [elapsed] = useState(chainElapsed);
  useLayoutEffect(() => {
    const now = performance.now();
    if (loaderChain.mounted === 0 && now - loaderChain.lastUnmount >= CHAIN_GAP_MS) loaderChain.start = now - elapsed;
    loaderChain.mounted += 1;
    return () => {
      loaderChain.mounted -= 1;
      loaderChain.lastUnmount = performance.now();
    };
  }, [elapsed]);
  return elapsed;
}

/** Test seam: forget any run in progress. */
export function resetLoaderChainForTests() {
  loaderChain.mounted = 0;
  loaderChain.start = 0;
  loaderChain.lastUnmount = -Infinity;
}

