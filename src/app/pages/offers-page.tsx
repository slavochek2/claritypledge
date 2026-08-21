/**
 * Program Page — Clarity Champions (P1087, superseding P937/P951's three-tier
 * pricing-grid page).
 *
 * The canonical URL for the offer ("claritypledge.com/pricing"); /program and /offers
 * redirect here. Reading order, REVERSED at founder UAT round 3:
 *
 *   1. The three-card offer ladder + assurance band              (OffersSection)
 *   2. What Clarity Champions is, its facts + next-batch countdown,
 *      then Month 1 / 2 / 3 / 4-and-beyond                       (ProgramTimelineSection)
 *   3. Two testimonials                                          (Testimonials)
 *   4. Closing CTA on Champions alone, with its own heading      (ChampionsCloseCta)
 *   5. FAQ
 *
 * Why the reversal (founder: "first show the pricing at the top, then show the specific
 * details of the Clarity Champions program, because it's kind of chosen, right?"): the old
 * order described ONE program at length and then produced a three-card grid, so the grid
 * read as three sizes of the thing just described. Leading with the grid makes the three
 * offers a choice, and everything after it is detail on the one most people take.
 *
 * The countdown moved three times across UAT and landed inside the Champions section, with
 * the "weekly live session / a batch of 3–10" facts (round 5). Round 3 put it at the page
 * close, round 4 under the price line. It belongs with the batch facts: that is the only
 * place where the word "batch" already has a referent on screen.
 *
 * Section paddings are deliberately tighter than the site default (py-20/28 stacked against
 * the timeline's own padding put roughly 14rem of dead space between sections).
 *
 * Wrapped in ClarityLandingLayout at the route (App.tsx), like the coach page.
 */
import { SEO } from "@/app/components/seo";
import {
  OffersSection,
  Testimonials,
  ChampionsCloseCta,
} from "@/app/components/landing/offers-section";
import { ProgramTimelineSection } from "@/app/components/landing/program-timeline-section";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CHAMPIONS_FAQS } from "@/app/content/faqs";

export function OffersPage() {
  return (
    <div className="bg-background text-foreground">
      <SEO
        title="Clarity Champions Program — Clarity Pledge"
        url="/pricing"
        description="Weekly live practice with a small batch of peers, €295/month, cancel anytime. Full refund if the first two sessions aren't for you."
      />
      <OffersSection className="pt-20 pb-16 lg:pt-24 lg:pb-20" />
      <ProgramTimelineSection className="border-t border-border pt-16 lg:pt-20" />
      <section className="px-4 pb-16 lg:pb-20">
        <Testimonials />
      </section>
      {/* Closing action on Champions alone. It now carries its own heading and one line of
          subtitle (UAT round 4): a bare "Start at €295/month" after the testimonials had
          lost its subject — "start what? Maybe they lost the idea." The heading names the
          thing, the line says what it is for, the button prices it.
          Plain background — the FAQ directly below is bg-muted/30, and two stacked muted
          bands read as one section with a stray button in it. */}
      <section className="border-t border-border px-4 py-16 lg:py-20">
        <div className="container mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Join the Clarity Champions Program
          </h2>
          <p className="text-pretty text-base text-muted-foreground">
            Bring clarity into your organization.
          </p>
          <div className="mt-2">
            <ChampionsCloseCta />
          </div>
        </div>
      </section>
      <section className="px-4 py-16 lg:py-20 bg-muted/30 border-t border-border">
        <div className="container mx-auto max-w-3xl">
          <Accordion type="single" collapsible>
            {CHAMPIONS_FAQS.map((faq, i) => (
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
