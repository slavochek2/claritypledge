import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function FAQSection() {
  const faqs = [
    {
      question: "Won't people think I'm rude or incompetent if I ask?",
      answer:
        'That is exactly why the Pledge exists. It changes the social contract. It reframes verification from an act of doubt ("I don\'t trust you") to an act of professional integrity ("I want to get this right").',
    },
    {
      question: "What if I can't explain it back?",
      answer:
        "Then you have discovered a gap in reality before it became a failure in action. That is a win.",
    },
    {
      question: "But I already do this—why do I need to take a pledge?",
      answer:
        "Great! But here's the problem: other people don't know you do it. Without a public signal, every person you meet must guess whether it's safe to verify your understanding. They face the social risk of potentially offending you. The Pledge removes that uncertainty. It's not about changing your behavior—it's about changing what others feel safe doing with you.",
    },
  ];

  return (
    <section id="faq" className="py-20 lg:py-32 px-4 bg-muted/30 scroll-mt-20">
      <div className="container mx-auto max-w-4xl">
        {/* Section Header */}
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-center mb-16">
          FAQ
        </h2>

        {/* Accordion */}
        <Accordion
          type="single"
          collapsible
          defaultValue="item-0"
          className="space-y-4"
        >
          {faqs.map((faq, index) => (
            <AccordionItem
              key={index}
              value={`item-${index}`}
              className="bg-card border border-border rounded-lg px-6 shadow-sm"
            >
              <AccordionTrigger className="text-xl lg:text-2xl font-semibold text-left hover:no-underline py-6">
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className="text-lg lg:text-xl text-foreground leading-relaxed pb-6">
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
