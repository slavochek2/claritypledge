/**
 * P1506 — the hospital brochure's own line icons and person figure, rebuilt as React SVG.
 * Paths are copied from the brochure source (one.html symbol defs) so the page and the
 * printed brochure read as one system. Stroke colour follows `currentColor`.
 */
import type { ReactNode } from "react";

function Icon({ children, className = "w-6 h-6" }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export type HospitalIconName =
  | "shield" | "star" | "scale" | "stay"
  | "dept" | "rank" | "heart" | "globe" | "case" | "change" | "clock";

export function HospitalIcon({ name, className }: { name: HospitalIconName; className?: string }) {
  switch (name) {
    case "shield": return <Icon className={className}><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></Icon>;
    case "star": return <Icon className={className}><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" /></Icon>;
    case "scale": return <Icon className={className}><path d="M12 3v18M7 21h10M4 7h16M4 7l-2.5 6a3 3 0 0 0 5 0zM20 7l-2.5 6a3 3 0 0 0 5 0z" /></Icon>;
    case "stay": return <Icon className={className}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" /><circle cx="12" cy="13" r="2.4" /><path d="M8 20c.5-2.2 2-3.4 4-3.4s3.5 1.2 4 3.4" /></Icon>;
    case "dept": return <Icon className={className}><rect x="2" y="9" width="7" height="12" rx="1" /><rect x="15" y="9" width="7" height="12" rx="1" /><path d="M9 13h6M12 10l3 3-3 3" /></Icon>;
    case "rank": return <Icon className={className}><circle cx="7" cy="6" r="3" /><circle cx="17" cy="10" r="2.4" /><path d="M2 21c0-3 2.2-6 5-6s5 3 5 6M13 21c0-2.4 1.8-4.6 4-4.6s4 2.2 4 4.6" /></Icon>;
    case "heart": return <Icon className={className}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></Icon>;
    case "globe": return <Icon className={className}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" /></Icon>;
    case "case": return <Icon className={className}><rect x="3" y="7" width="18" height="13" rx="1.5" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 12h18" /></Icon>;
    case "change": return <Icon className={className}><rect x="3" y="4" width="18" height="13" rx="1.5" /><path d="M8 21h8M12 17v4M8 11l3 3 5-5" /></Icon>;
    case "clock": return <Icon className={className}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></Icon>;
  }
}

/** The brochure's person figure (symbol #p). */
export function PersonFigure({ className, fill }: { className?: string; fill: string }) {
  return (
    <svg viewBox="0 0 20 30" className={className} aria-hidden="true" fill={fill}>
      <circle cx="10" cy="6" r="5" />
      <path d="M1 30c0-10 4-16 9-16s9 6 9 16z" />
    </svg>
  );
}

const GREY = "#cbd5e1";
const BLUE = "#2563eb";

/** One stage of the 5-step path: five people, coloured blue as the norm spreads. */
export function PeopleStrip({ blue, questions = [], plus = false }: { blue: number[]; questions?: number[]; plus?: boolean }) {
  return (
    <svg viewBox="0 0 92 24" className="w-full max-w-[7.5rem] h-8 mx-auto block" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} x={4 + 17 * i} y={2} width={14} height={21} viewBox="0 0 20 30" fill={blue.includes(i) ? BLUE : GREY}>
          <circle cx="10" cy="6" r="5" />
          <path d="M1 30c0-10 4-16 9-16s9 6 9 16z" />
        </svg>
      ))}
      {questions.map((i) => (
        <text key={`q${i}`} x={9 + 17 * i} y={6} fontWeight={700} fontSize={8} fill="#64748b">?</text>
      ))}
      {plus && <text x={84} y={9} fontWeight={700} fontSize={10} fill={BLUE}>+</text>}
    </svg>
  );
}
