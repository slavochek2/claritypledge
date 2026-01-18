import { cn } from "@/lib/utils";

interface ClarityLogoProps {
  /** Size variant */
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Show only the mark (no wordmark) */
  iconOnly?: boolean;
  /** Custom className for the container */
  className?: string;
}

const sizeMap = {
  xs: { icon: 20, text: "text-base" },
  sm: { icon: 24, text: "text-lg" },
  md: { icon: 32, text: "text-xl" },
  lg: { icon: 40, text: "text-2xl" },
  xl: { icon: 48, text: "text-3xl" },
} as const;

/**
 * Clarity Pledge logo component with rounded rectangle mark.
 * Uses rounded corners for a modern, friendly feel while maintaining structure.
 */
export function ClarityLogo({
  size = "md",
  iconOnly = false,
  className
}: ClarityLogoProps) {
  const { icon, text } = sizeMap[size];

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {/* Logo Mark - C shape matches favicon design */}
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 128 128"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect width="128" height="128" rx="16" fill="#3b82f6" />
        <path
          d="M88 40.5 C 82 35 73 32 64 32 C 44 32 32 48 32 64 C 32 80 44 96 64 96 C 73 96 82 93 88 87.5"
          stroke="white"
          strokeWidth="14"
          strokeLinecap="round"
          fill="none"
        />
      </svg>

      {!iconOnly && (
        <span className={cn("font-bold tracking-tight", text)}>
          Clarity Pledge
        </span>
      )}
    </span>
  );
}

/**
 * Standalone circular logo mark for use in certificates, seals, etc.
 * Uses circle shape for traditional seal/badge aesthetic.
 * Inline SVG version for contexts where component can't be used (like html-to-image).
 */
export function ClarityLogoMark({
  size = 48,
  className
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Circle background to fill circular seal container */}
      <circle cx="64" cy="64" r="64" fill="#3b82f6" />
      <path
        d="M88 40.5 C 82 35 73 32 64 32 C 44 32 32 48 32 64 C 32 80 44 96 64 96 C 73 96 82 93 88 87.5"
        stroke="white"
        strokeWidth="14"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
