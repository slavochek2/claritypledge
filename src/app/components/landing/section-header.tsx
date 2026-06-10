import { ReactNode } from "react";

/**
 * Centered section header used across the landing surfaces (coach landing,
 * program page). Extracted from coach-partnership-page (P916) so both pages
 * share one definition. Pure presentation — no logic.
 */
export function SectionHeader({ title, subtitle }: { title: ReactNode; subtitle?: string }) {
  return (
    <div className="text-center mb-14">
      {/* text-3xl at base: long unbreakable words clip at text-4xl on 320px viewports */}
      <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">{title}</h2>
      {subtitle && <p className="text-xl lg:text-2xl text-muted-foreground font-medium max-w-2xl mx-auto">{subtitle}</p>}
    </div>
  );
}
