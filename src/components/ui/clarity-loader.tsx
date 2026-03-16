/**
 * @file clarity-loader.tsx
 * @description Branded loading animation — the ClarityPledge "C" draws itself
 * once via stroke-dasharray/dashoffset, then settles into a gentle breathing
 * animation (opacity pulse). The blue rounded rectangle stays solid throughout.
 *
 * Anti-flash: ClarityPageLoader uses CSS animation-delay (300ms) to stay
 * invisible on fast loads. Pure CSS — no JS timers, no re-renders.
 */

interface ClarityLoaderProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_MAP = { sm: 32, md: 48, lg: 64 } as const;

export function ClarityLoader({ size = "md", className }: ClarityLoaderProps) {
  const px = SIZE_MAP[size];

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Loading"
    >
      <rect width="128" height="128" rx="16" fill="#3b82f6" />
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
 * Full-page centered loader with CSS-based anti-flash.
 * Invisible for first 300ms (via CSS animation-delay), then fades in.
 * Fast loads never show a flash; slow loads get a smooth appearance.
 */
export function ClarityPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 clarity-page-loader">
      <div className="flex justify-center">
        <ClarityLoader size="lg" />
      </div>
    </div>
  );
}
