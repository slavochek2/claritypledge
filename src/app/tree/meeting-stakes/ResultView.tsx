/** Step 4 of /tree/meeting-stakes: the verdict, the answers behind it, the break-even, and the meetings checked so far. */
import { CONDITIONS, labelOf, riskOf, verdictCopy, type Answers, type Gate, type Money, type VerdictKind } from "./model";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MoneyResult } from "./MoneyResult";

/** The shared Accordion (as on the offers page), its trigger in the blue of things that can be clicked. */
const TRIGGER = "min-h-11 py-2 text-base font-medium text-blue-700";

const BYLINE =
  "ClarityPledge is for high-stakes meetings, like a kickoff, where success depends on shared understanding. A gap in understanding gets more dangerous the fuzzier the intent behind a decision, the later its results show up, the more damage it can do, the harder it is to undo, and the more each side explains the results its own way. ClarityPledge gives the meeting host a way to check.";

export function ResultView({ name, verdict, gate, answers, money, onAddEstimates }: { name: string; verdict: VerdictKind; gate: Gate | null; answers: Answers; money: Money; onAddEstimates: () => void }) {
  const copy = verdictCopy(verdict, answers);
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <p className="break-words text-sm text-muted-foreground">{name}</p>
      <p className="mt-1 text-2xl font-semibold">{copy.title}</p>
      <p className="mt-2">{copy.body}</p>

      {gate === "yes" && <MoneyResult money={money} onAddEstimates={onAddEstimates} />}

      <Accordion type="multiple" className="mt-6 border-t border-border">
        {gate === "yes" && (
          <AccordionItem value="answers">
            <AccordionTrigger className={TRIGGER}>Your answers</AccordionTrigger>
            <AccordionContent>
              <ul className="grid gap-3">
                {CONDITIONS.map((c) => {
                  const a = answers[c.key];
                  const risk = a === null ? 0 : riskOf(c.key, a);
                  return (
                    <li key={c.key}>
                      <p className="text-muted-foreground">{c.point}</p>
                      <p className="font-medium">
                        {a === null ? "Not answered" : labelOf(a)}
                        {/* Plain text, not blue: blue marks what can be clicked. */}
                        {risk > 0 && <span className="font-normal"> · raises the risk ({c.name.toLowerCase()})</span>}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </AccordionContent>
          </AccordionItem>
        )}
        <AccordionItem value="why" className="border-b-0">
          <AccordionTrigger className={TRIGGER}>Why these questions</AccordionTrigger>
          <AccordionContent className="text-muted-foreground">{BYLINE}</AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
