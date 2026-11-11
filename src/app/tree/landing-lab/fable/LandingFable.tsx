/**
 * /tree/landing-fable — a visual redesign of the build-the-right-thing landing (P1665).
 * Design exploration only: every word, citation and shared component is the one on
 * /builders (src/app/pages/build-right-thing-landing.tsx); only the layout and the
 * visual language change. Analytics and the ?referrer / ?login redirects are left out here
 * and must be carried over if this design replaces the page.
 *
 * The idea: the page is about one line becoming five. The hero draws that; the sections
 * read as a numbered case file, left-aligned; dark bands carry the two moments that should
 * stop the scroll (the stake, the promise); the close draws the lines coming back together.
 */
import { motion, MotionConfig } from "framer-motion";
import { ShieldCheckIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { SEO } from "@/app/components/seo";
import { FounderCredibility } from "@/app/components/landing/founder-credibility";
import { MisunderstandingVenn } from "@/app/components/landing/misunderstanding-venn";
import { HardTruthChat } from "@/app/components/landing/hard-truth-chat";
import { HowPlatformWorks } from "@/app/components/landing/how-platform-works";
import { ScrollIndicator, PledgerAvatarStack } from "@/app/components/landing/social-proof";
import { CertificateFrame, CertificateOathBody } from "@/app/components/agreements/certificate-frame";
import { TemplateStamp } from "@/app/components/agreements/template-stamp";
import { COA_VERSIONS, CURRENT_COA_VERSION } from "@/app/content/coa-versions";
import { ASSUMED_STATS, REASONS_NOBODY_CHECKS, REFERENCES } from "./fable-content";
import { AuditCTA, DivergenceGraphic, DotStat, Indented, RefSup, Reveal, SectionHeading } from "./fable-parts";

const VIEWPORT_ONCE = { once: true, amount: 0.25 } as const;
const STAGGER = { hidden: {}, show: { transition: { staggerChildren: 0.12 } } };
const RISE = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45 } } };
const SHELL = "container mx-auto max-w-6xl";

function Hero() {
  return (
    <section className="relative overflow-hidden px-4 pt-10 pb-8 lg:min-h-[calc(100vh-5rem)] lg:pt-8 lg:pb-10 flex flex-col">
      <div className={`${SHELL} flex flex-1 flex-col justify-center`}>
        <p className="mb-7 inline-flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
          <ShieldCheckIcon className="h-4 w-4" />
          Prevent rework before work begins
        </p>
        <h1 className="text-[2.1rem] sm:text-5xl lg:text-[3.25rem] xl:text-[4.25rem] font-semibold leading-[1.06] tracking-tighter">
          <span className="block text-foreground/55">Your team agreed on the strategy.</span>
          <span className="block">Each of your AIs ships 10x faster.</span>
          <motion.span
            className="block text-blue-500"
            initial={{ opacity: 0, filter: "blur(6px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.7, delay: 0.45 }}
          >
            In opposing directions.
          </motion.span>
        </h1>
        <div className="mt-8 grid items-center gap-x-8 gap-y-8 lg:mt-4 lg:grid-cols-12">
          <motion.div className="lg:col-span-7" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 1.3 }}>
            <p className="max-w-xl border-l-2 border-blue-500 pl-5 text-xl lg:text-2xl font-medium text-muted-foreground">
              Get your team off the treadmill.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
              <AuditCTA />
              <p className="text-muted-foreground">
                or{" "}
                <Link to="/sign-pledge" className="inline-flex min-h-10 items-center text-blue-500 underline underline-offset-4 hover:text-blue-600">
                  Take the Pledge
                </Link>
              </p>
            </div>
            <div className="mt-8 flex justify-start">
              <PledgerAvatarStack />
            </div>
          </motion.div>
          <DivergenceGraphic className="mx-auto w-full max-w-[15rem] lg:col-span-5 lg:-mt-10 lg:max-w-[24rem] lg:justify-self-end" />
        </div>
      </div>
      <ScrollIndicator label="Why it matters" targetId="stakes" className="pt-4 lg:pt-0" />
    </section>
  );
}

function Stakes() {
  return (
    <section id="stakes" className="scroll-mt-16 bg-slate-950 px-4 py-24 text-white lg:py-36">
      <Reveal className={`${SHELL} grid items-end gap-10 lg:grid-cols-12`}>
        <p className="whitespace-nowrap text-[26vw] font-semibold leading-[0.8] tracking-tighter lg:col-span-7 lg:text-[10rem] xl:text-[12rem]">
          <span className="text-blue-400">1</span> in 3
        </p>
        <div className="space-y-7 lg:col-span-5">
          <div className="flex gap-3" aria-hidden>
            <span className="h-14 flex-1 rounded-sm bg-blue-400" />
            <span className="h-14 flex-1 rounded-sm border border-white/25" />
            <span className="h-14 flex-1 rounded-sm border border-white/25" />
          </div>
          <p className="text-2xl font-medium leading-snug text-balance sm:text-3xl">
            failed startups built something the market never wanted.
            <RefSup n={1} tone="dark" />
          </p>
        </div>
      </Reveal>
    </section>
  );
}

function Assumption() {
  return (
    <section className="border-t border-border px-4 py-20 lg:py-32">
      <div className={SHELL}>
        <Reveal>
          <SectionHeading index="01" title={<>Everybody <span className="text-blue-500">assumes</span> they understand</>} />
        </Reveal>
        <Indented>
          <motion.ul variants={STAGGER} initial="hidden" whileInView="show" viewport={VIEWPORT_ONCE} className="border-b border-foreground/15">
            {ASSUMED_STATS.map((s) => (
              <DotStat key={s.label} value={s.value} denom={s.denom}>
                {s.label}
                <RefSup n={s.ref} />
              </DotStat>
            ))}
          </motion.ul>
        </Indented>
      </div>
    </section>
  );
}

function Reasons() {
  return (
    <section className="border-t border-border bg-muted/40 px-4 py-20 lg:py-32">
      <div className={SHELL}>
        <Reveal>
          <SectionHeading index="02" title={<>Why almost nobody <span className="text-blue-500">verifies</span> understanding</>} />
        </Reveal>
        <Indented>
          <motion.div variants={STAGGER} initial="hidden" whileInView="show" viewport={VIEWPORT_ONCE} className="grid gap-x-10 gap-y-12 sm:grid-cols-3">
            {REASONS_NOBODY_CHECKS.map((r, i) => (
              <motion.div key={r.title} variants={RISE} className="border-t-2 border-foreground pt-5">
                <p className="font-mono text-xs tracking-[0.25em] text-blue-600" aria-hidden>
                  {String.fromCharCode(65 + i)}
                </p>
                <h3 className="mt-6 text-2xl font-semibold tracking-tight">{r.title}</h3>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  {r.text}
                  <RefSup n={r.ref} />
                  {r.ref2 && <RefSup n={r.ref2} />}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </Indented>
      </div>
    </section>
  );
}

function Promise() {
  const coa = COA_VERSIONS[CURRENT_COA_VERSION];
  return (
    <section className="overflow-hidden bg-slate-950 px-4 py-20 text-white lg:py-32">
      <div className={SHELL}>
        <Reveal>
          <SectionHeading
            index="04"
            tone="dark"
            title={<>Make it normal to admit <span className="text-blue-400">&ldquo;I don&rsquo;t understand&rdquo;</span></>}
            sub="Reveal gaps easily. Bridge them safely."
          />
        </Reveal>
        <Indented>
          <Reveal className="relative max-w-3xl text-foreground">
            <CertificateFrame
              ariaLabel="Clarity Group Terms"
              title={coa.title}
              kicker="A commitment to every member"
              epigraph="We all crave being understood. Let's commit to listen."
            >
              <CertificateOathBody sections={[coa.yourRight, coa.myPromise, coa.exception]} />
            </CertificateFrame>
            <TemplateStamp animate />
          </Reveal>
        </Indented>
      </div>
    </section>
  );
}

function Close() {
  return (
    <section className="overflow-hidden bg-blue-600 px-4 py-24 text-white lg:py-36">
      <Reveal className={`${SHELL} grid items-center gap-x-8 gap-y-10 lg:grid-cols-12`}>
        <div className="lg:col-span-8">
          <h2 className="text-[1.75rem] sm:text-6xl lg:text-7xl font-semibold leading-[1.06] tracking-tighter text-balance break-words">
            <span className="block text-blue-200">Stop fighting the wrong disagreement.</span>
            <span className="block">Start revealing hidden misunderstandings.</span>
          </h2>
          <div className="mt-12">
            <AuditCTA tone="inverse" />
          </div>
        </div>
        <DivergenceGraphic tone="dark" mirror className="mx-auto w-full max-w-[15rem] lg:col-span-4 lg:max-w-none" />
      </Reveal>
    </section>
  );
}

export function LandingFable() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="bg-background text-foreground">
        <SEO
          title="Build the Right Thing"
          url="/"
          description="Your team agreed on the strategy. Each of your AIs ships 10x faster. In opposing directions. Get your team off the treadmill. Prevent rework before work begins."
        />
        <Hero />
        <Stakes />

        <section className="border-t border-border bg-muted/40 px-4 py-20 lg:py-28">
          <HardTruthChat
            variant="they-withheld"
            heading={<>What your team member <span className="text-blue-500">didn't say</span>.</>}
            contact="Maya"
            subtitle="your teammate"
            received="Let's commit to this direction. Trust me, it's the right call 😄"
            honest={`"I don't actually understand why this is the right call. But asking again would make me look like I don't get it. So I'll run with it and hope I guessed right."`}
            sent="Sounds good, on it 👍"
            consequence="3 months later · half the roadmap built on a guess"
            thoughtTitle="Why didn't Maya say it?"
            thoughtBody={`"You sounded sure. Pushing back would've looked like I wasn't on board."`}
          />
        </section>

        <Assumption />
        <Reasons />

        <section className="border-t border-border px-4 py-20 lg:py-32">
          <div className={SHELL}>
            <Reveal>
              <SectionHeading index="03" kicker="The root cause" title={<>The illusion of <span className="text-blue-500">shared understanding</span></>} />
            </Reveal>
            <Reveal className="mx-auto max-w-4xl text-center">
              <MisunderstandingVenn />
            </Reveal>
          </div>
        </section>

        <section className="border-t border-border bg-muted/40 px-4 py-20 lg:py-28">
          <HowPlatformWorks />
        </section>

        <Promise />
        <FounderCredibility />
        <Close />

        <section id="references" className="scroll-mt-16 px-4 py-12">
          <div className={SHELL}>
            <p className="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">References</p>
            <ol className="text-xs text-muted-foreground lg:columns-2 lg:gap-x-10">
              {REFERENCES.map((r) => (
                <li key={r.n} className="mb-2 flex break-inside-avoid gap-2">
                  <span className="shrink-0 tabular-nums">{r.n}.</span>
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
                    {r.label}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </MotionConfig>
  );
}

export default LandingFable;
