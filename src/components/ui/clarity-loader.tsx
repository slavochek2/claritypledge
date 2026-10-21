/**
 * @file clarity-loader.tsx
 * @description Branded loading animation — the ClarityPledge "C" draws itself
 * once via stroke-dasharray/dashoffset, then settles into a gentle breathing
 * animation (opacity pulse). The blue rounded rectangle stays solid throughout.
 *
 * Anti-flash: ClarityPageLoader uses CSS animation-delay (300ms) to stay
 * invisible on fast loads. Pure CSS — no JS timers, no re-renders.
 */

import type { CSSProperties } from "react";
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

/**
 * Boot splash: full-viewport centered loader for surfaces with no shell around them
 * (pre-auth, public and focus pages). CSS-based anti-flash: invisible for the first 300ms
 * (animation-delay), then fades in. Fast loads never show a flash.
 */
export function ClarityBootLoader() {
  const style = chainStyle(useLoaderChain());
  return (
    <div className="min-h-screen flex items-center justify-center p-4 clarity-page-loader" style={style}>
      <div className="flex justify-center">
        <ClarityLoader size="lg" />
      </div>
    </div>
  );
}

/**
 * P1539: content loader for INSIDE the signed-in shell. It fills the content area (flex-1,
 * never min-h-screen) so the sidebar, bottom bar and footer do not jump when content arrives.
 * Same 300ms CSS anti-flash as the boot splash.
 */
export function ClarityContentLoader() {
  const style = chainStyle(useLoaderChain());
  return (
    <div
      data-testid="content-loader"
      className="flex min-h-[calc(100dvh-10rem)] w-full flex-1 items-center justify-center p-4 clarity-page-loader"
      style={style}
    >
      <div className="flex justify-center">
        <ClarityLoader size="md" />
      </div>
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
