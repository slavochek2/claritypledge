/**
 * Pricing Page — P937/P951 (public, /pricing; /offers redirects here).
 *
 * A thin, shareable pricing surface: a single URL ("claritypledge.com/pricing") to
 * drop in the webinar chat / a DM / an email, and the home for the program buy-links.
 * Not promoted in nav — a direct-link / post-webinar destination. Body is the shared
 * <OffersSection variant="full" /> (three tiers). Wrapped in ClarityLandingLayout at
 * the route (App.tsx), like the program/coach pages.
 */
import { SEO } from "@/app/components/seo";
import { OffersSection } from "@/app/components/landing/offers-section";
import { ProgramTimelineSection } from "@/app/components/landing/program-timeline-section";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PROGRAM_FAQS } from "@/app/content/faqs";

export function OffersPage() {
  return (
    <div className="bg-background text-foreground">
      <SEO
        title="Co-Founder Program — Clarity Pledge"
        url="/program"
        description="The app is free forever. The coached Co-Founder Program is €950 per pair. Transparent, per-pair pricing with a full money-back guarantee."
      />
      <ProgramTimelineSection className="pt-24 lg:pt-28" />
      <div className="py-20 lg:py-28">
        <OffersSection variant="full" />
      </div>
      <section className="px-4 py-20 lg:py-28 bg-muted/30 border-t border-border">
        <div className="container mx-auto max-w-3xl">
          <Accordion type="single" collapsible>
            {PROGRAM_FAQS.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border-b border-border">
                <AccordionTrigger className="text-base font-medium text-left hover:no-underline py-5">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-base text-muted-foreground leading-relaxed pb-5">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </div>
  );
}

export default OffersPage;
