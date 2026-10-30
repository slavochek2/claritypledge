/**
 * @file clarity-loader.tsx
 * @description Branded loading animation — the ClarityPledge "C" draws itself
 * once via stroke-dasharray/dashoffset, then settles into a gentle breathing
 * animation (opacity pulse). The blue rounded rectangle stays solid throughout.
 *
 * Anti-flash: ClarityPageLoader uses CSS animation-delay (300ms) to stay
 * invisible on fast loads. Pure CSS — no JS timers, no re-renders. The one timer here is the
 * slow-wait deadline (SlowLoadNotice), which touches only its own element.
 */

import { useEffect, useState, type CSSProperties } from "react";
import { Button } from "./button";
import { useInShellContent } from "./loader-context";
import { useLoaderChain } from "./loader-chain";

/** CSS variable the animations read as their time offset; the unset value is 0ms. */
function chainStyle(elapsed: number): CSSProperties | undefined {
  return elapsed > 0 ? ({ "--loader-elapsed": `${Math.round(elapsed)}ms` } as CSSProperties) : undefined;
}

interface ClarityLoaderProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  style?: CSSProperties;
}

const SIZE_MAP = { sm: 32, md: 48, lg: 64 } as const;

export function ClarityLoader({ size = "md", className, style }: ClarityLoaderProps) {
  const px = SIZE_MAP[size];

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      role="img"
      aria-label="Loading"
    >
      <rect width="128" height="128" rx="16" fill="#2563eb" />
      <path
        d="M88 40.5 C 82 35 73 32 64 32 C 44 32 32 48 32 64 C 32 80 44 96 64 96 C 73 96 82 93 88 87.5"
        stroke="white"
        strokeWidth="14"
        strokeLinecap="round"
        fill="none"
        strokeDasharray="200"
        className="clarity-loader-c"
      />
    </svg>
  );
}

/** P1586: how long a page-level wait may run before the loader says so and offers a way out. */
const PAGE_WAIT_DEADLINE_MS = 15_000;

/**
 * P1586: the deadline for every page-level wait, in one place. Own state, so the timer re-renders
 * only this element, and only once: the loader and its mark are untouched before and after. It is
 * a separate fixed box under the mark's centre (the mark is 64px: 32px to its edge + 8px gap), so the
 * mark never moves. A late answer needs no code here: the page stops rendering the loader when its
 * data arrives, which unmounts this and its timer.
 */
function SlowLoadNotice({ startedAgoMs, inColumn = false }: { startedAgoMs: number; inColumn?: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    // Counted from the start of the loader run, not this instance: loaders that replace each other (route
    // guard -> lazy chunk -> page -> redirect target) are one wait, and a fresh 15s per instance let a chain
    // of them wait forever without the notice (measured on the event room gate, P1586 e2e).
    // The first loader after the static splash is seeded with the splash's animation time (SPLASH_SEED_MS),
    // which is not wall-clock waiting; no wait can be longer than the time since navigation started.
    const waited = Math.min(startedAgoMs, performance.now());
    const t = setTimeout(() => setSlow(true), Math.max(0, PAGE_WAIT_DEADLINE_MS - waited));
    return () => clearTimeout(t);
  }, [startedAgoMs]); // fixed for the loader's lifetime: useLoaderChain captures it at mount
  if (!slow) return null;
  return (
    <div
      role="status"
      className={`pointer-events-none fixed right-0 top-1/2 mt-10 flex flex-col items-center gap-3 px-6 text-center ${inColumn ? 'left-[var(--shell-sidebar-w,0px)]' : 'left-0'}`}
    >
      {/* [FOUNDER DECISION: slow page-load copy is a placeholder.] */}
      <p className="text-sm text-muted-foreground">This is taking longer than usual.</p>
      <Button variant="outline" className="pointer-events-auto min-h-10" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </div>
  );
}

/**
 * Boot splash: full-viewport centered loader for surfaces with no shell around them
 * (pre-auth, public and focus pages). CSS-based anti-flash: invisible for the first 300ms
 * (animation-delay), then fades in. Fast loads never show a flash.
 */
export function ClarityBootLoader() {
  const elapsed = useLoaderChain();
  const style = chainStyle(elapsed);
  return (
    <div data-testid="boot-loader" className="min-h-screen clarity-page-loader" style={style}>
      {/* P1586: the box holds the page's height; the mark is viewport-centred like the index.html splash
          and the content loader. Centring it inside the box put it below a public nav (measured: splash at
          y=360, this mark at y=440 on a 720px viewport), so the mark jumped on every signed-out cold load. */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center">
        <ClarityLoader size="lg" />
      </div>
      <SlowLoadNotice startedAgoMs={elapsed} />
    </div>
  );
}

/**
 * P1539: content loader for INSIDE the signed-in shell. It fills the content area (flex-1,
 * never min-h-screen) so the sidebar, bottom bar and footer do not jump when content arrives.
 * Same 300ms CSS anti-flash as the boot splash, and the same 64px mark at the same viewport centre.
 */
export function ClarityContentLoader() {
  const elapsed = useLoaderChain();
  const style = chainStyle(elapsed);
  return (
    <div
      data-testid="content-loader"
      className="flex min-h-[calc(100dvh-10rem)] w-full flex-1 clarity-page-loader"
      style={style}
    >
      {/* The box above only holds the content area's height (footer and layout do not jump). The mark is fixed (it
          never takes a click and never depends on the bottom bar or strip geometry) and centred on the CONTENT column:
          P1595 (founder UAT) — viewport-centred, it sat off-centre beside the desktop sidebar, open or collapsed. The
          shell sets --shell-sidebar-w (lg only; 0 on a phone, where there is no sidebar). Vertically it stays at the
          splash's height, so the splash -> content loader hand-off moves only sideways, and only on a desktop. */}
      <div className="pointer-events-none fixed inset-y-0 right-0 left-[var(--shell-sidebar-w,0px)] flex items-center justify-center" data-testid="content-loader-mark">
        <ClarityLoader size="lg" />
      </div>
      <SlowLoadNotice startedAgoMs={elapsed} inColumn />
    </div>
  );
}

/**
 * The page loader every call site uses. Inside the shell (InShellContentContext) it is the
 * content loader; elsewhere it is the full-viewport boot splash.
 */
export function ClarityPageLoader() {
  const inShell = useInShellContent();
  return inShell ? <ClarityContentLoader /> : <ClarityBootLoader />;
}
