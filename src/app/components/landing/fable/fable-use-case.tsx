/**
 * Fable sections the remaining use-case pages need and /builders, /change-managers do not (P1674):
 * the page frame, a chat exhibit band, the "Everybody assumes" dots, the illusion section, the
 * partner-agreement specimen, the FAQ and the testimonials. Copy is always the caller's.
 */
import type { ReactNode } from "react";
import { motion, MotionConfig } from "framer-motion";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AgreementCertificate } from "@/app/components/agreements/agreement-certificate";
import { CURRENT_AGREEMENT_VERSION } from "@/app/content/agreement-versions";
import { SHELL, type Reference } from "./fable-content";
import { STAGGER, VIEWPORT_ONCE } from "./fable-motion";
import { DotStat, Indented, RefSup, Reveal, SectionHeading } from "./fable-parts";
import { FableTrackingProvider, type FableTracking } from "./fable-tracking";

/** The page frame every fable page shares: its tracking, reduced motion honoured, the colours, and its SEO. */
export function FablePage({ tracking = {}, seo, children }: { tracking?: FableTracking; seo: ReactNode; children: ReactNode }) {
  return (
    <FableTrackingProvider value={tracking}>
      <MotionConfig reducedMotion="user">
        <div className="bg-background text-foreground">
          {seo}
          {children}
        </div>
      </MotionConfig>
    </FableTrackingProvider>
  );
}

/** A chat exhibit on the muted band, as the /change-managers chat. `id`: an anchor a cue targets. */
export function ChatSection({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 border-t border-border bg-muted/40 px-4 py-16 lg:py-28">
      {children}
    </section>
  );
}

export type AssumedStat = { value: number; denom: number; label: string; ref: number };

/** "Everybody assumes they understand": three fractions as dots, each with its citation. */
export function AssumedSection({ index, stats, references, muted = false }: { index: string; stats: AssumedStat[]; references: Reference[]; muted?: boolean }) {
  return (
    <section className={`border-t border-border px-4 py-16 lg:py-28 ${muted ? "bg-muted/40" : ""}`}>
      <div className={SHELL}>
        <Reveal>
          <SectionHeading index={index} title={<>Everybody <span className="text-blue-600">assumes</span> they understand</>} />
        </Reveal>
        <Indented>
          <motion.ul variants={STAGGER} initial="hidden" whileInView="show" viewport={VIEWPORT_ONCE} className="border-b border-foreground/15">
            {stats.map((s) => (
              <DotStat key={s.label} value={s.value} denom={s.denom}>
                {s.label}
                <RefSup n={s.ref} label={references.find((r) => r.n === s.ref)?.label} />
              </DotStat>
            ))}
          </motion.ul>
        </Indented>
      </div>
    </section>
  );
}

/** "The illusion of shared understanding": the page's own Venn under a numbered heading. */
export function IllusionSection({ index, kicker, muted = false, children }: { index: string; kicker?: string; muted?: boolean; children: ReactNode }) {
  return (
    <section className={`border-t border-border px-4 py-16 lg:py-28 ${muted ? "bg-muted/40" : ""}`}>
      <div className={SHELL}>
        <Reveal>
          <SectionHeading index={index} kicker={kicker} title={<>The illusion of <span className="text-blue-600">shared understanding</span></>} />
        </Reveal>
        <Reveal className="mx-auto max-w-4xl text-center">{children}</Reveal>
      </div>
    </section>
  );
}

/** The partner agreement as an unsigned specimen (two famous names), for the promise band. */
export function PartnerAgreementSpecimen() {
  return <AgreementCertificate variant="pending" agreementVersion={CURRENT_AGREEMENT_VERSION} creatorName="Albert Einstein" partnerName="Mother Teresa" />;
}

/** The FAQ, left-aligned in the content column. */
export function FaqSection({ faqs }: { faqs: { q: string; a: ReactNode }[] }) {
  return (
    <section className="border-t border-border bg-muted/40 px-4 py-16 lg:py-28">
      <div className={SHELL}>
        <Indented className="max-w-3xl">
          <Accordion type="single" collapsible className="border-t border-foreground/15">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border-b border-foreground/15">
                <AccordionTrigger className="py-5 text-left text-base sm:text-lg font-semibold tracking-tight hover:no-underline">{faq.q}</AccordionTrigger>
                <AccordionContent className="pb-5 text-base leading-relaxed text-foreground/75">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Indented>
      </div>
    </section>
  );
}

/** A band for a block that brings its own layout (the testimonials). */
export function PlainSection({ children }: { children: ReactNode }) {
  return <section className="border-t border-border px-4 py-16 lg:py-24">{children}</section>;
}
