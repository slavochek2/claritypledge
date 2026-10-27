import type { ReactNode } from "react";
import { BrainIcon, EyeOffIcon, UsersIcon } from "lucide-react";
import { motion } from "framer-motion";
import { SectionHeader } from "@/app/components/landing/section-header";
import { Reveal } from "./reveal";
import { MUTED, SECTION, STAGGER_CONTAINER, STAGGER_ITEM, VIEWPORT_ONCE } from "./landing-motion";

export type ReasonSource = "ha" | "newton" | "camerer";
export const HOSPITAL_HIERARCHY_TEXT =
  "Asking how much someone really understood feels awkward, especially across seniority. Read-back covers clinical orders, not everyday talk.";
export const NEUTRAL_HIERARCHY_TEXT = "Asking how much someone really understood feels awkward, especially across seniority.";

/**
 * "Why almost nobody verifies understanding": the three reasons. Citations are rendered by the
 * page via `cite(source)` (its own numbering, its own References list); return null for no citation.
 * The hierarchy text is a prop because the hospital version cites clinical read-back.
 */
export function WhyNobodyVerifiesSection({
  cite,
  hierarchyText = HOSPITAL_HIERARCHY_TEXT,
  muted = false,
}: {
  cite: (source: ReasonSource) => ReactNode;
  hierarchyText?: string;
  muted?: boolean;
}) {
  const reasons = [
    { icon: UsersIcon, title: "Hierarchy", text: hierarchyText, source: "ha" as const },
    { icon: EyeOffIcon, title: "Illusion of transparency", text: "We think our meaning is obvious. People tapping a song expect half of listeners to name it; 2.5% do.", source: "newton" as const },
    { icon: BrainIcon, title: "Curse of knowledge", text: "Once you know something, it is hard to feel what the other person is missing.", source: "camerer" as const },
  ];
  return (
    <section className={`${SECTION} ${muted ? MUTED : ""}`}>
      <div className="container mx-auto max-w-4xl">
        <Reveal>
          <SectionHeader title={<span className="inline-block text-balance">Why almost nobody <span className="text-blue-500">verifies</span> understanding</span>} />
        </Reveal>
        <motion.ul className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-left" variants={STAGGER_CONTAINER} initial="hidden" whileInView="show" viewport={VIEWPORT_ONCE}>
          {reasons.map((r) => (
            <motion.li key={r.title} variants={STAGGER_ITEM} className="rounded-xl border border-border bg-card p-6 shadow-sm">
              <r.icon className="w-8 h-8 text-blue-600 mb-3" aria-hidden="true" />
              <h3 className="text-lg font-bold mb-2">{r.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {r.text}
                {cite(r.source)}
              </p>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  );
}
