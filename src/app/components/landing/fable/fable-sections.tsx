/**
 * The sections of the fable layout (P1667; live since P1671): builders and change managers render
 * the same sections with their own copy. Text-argument sections are
 * left-aligned and numbered; the two chat exhibits (HardTruthChat, the gap exchange) keep their
 * own centred headings, as on the production pages.
 */
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { ScrollIndicator, PledgerAvatarStack } from "@/app/components/landing/social-proof";
import { NormChart } from "@/app/components/landing/team-norm-section";
import { PeopleStrip } from "@/app/components/hospitals/hospital-icons";
import { GapExchangeSection } from "@/app/components/hospitals/gap-exchange";
import { CertificateFrame, CertificateOathBody } from "@/app/components/agreements/certificate-frame";
import { TemplateStamp } from "@/app/components/agreements/template-stamp";
import { COA_VERSIONS, CURRENT_COA_VERSION } from "@/app/content/coa-versions";
import { AgreedGraphic } from "./fable-agreed";
import { NORM_PATH, SHELL, type AgreedExample, type Reason, type Reference } from "./fable-content";
import type { ExchangeCast } from "@/app/content/exchange-casts";
import { RISE, STAGGER, VIEWPORT_ONCE } from "./fable-motion";
import { AuditCTA, Indented, RefSup, Reveal, SectionHeading } from "./fable-parts";
import { useFableTracking } from "./fable-tracking";

/**
 * Hero. On a phone the text column fills the first screen and ends at the scroll cue, so the
 * example below starts on the second screen as its own band and is never cut by the fold. From
 * `lg` up the example sits beside the text.
 */
export function FableHero({
  eyebrow,
  EyebrowIcon,
  title,
  sub,
  example,
  nextId,
  nextLabel,
}: {
  eyebrow: string;
  EyebrowIcon: LucideIcon;
  title: ReactNode;
  sub: string;
  example: AgreedExample;
  nextId: string;
  nextLabel: string;
}) {
  const { pledge } = useFableTracking();
  return (
    <section className="relative flex flex-col overflow-hidden px-4 lg:min-h-[calc(100vh-5rem)]">
      <div className={`${SHELL} grid gap-x-12 lg:flex-1 lg:grid-cols-12 lg:items-center lg:py-8`}>
        {/* 4rem is the site menu's height below `lg`. If the menu grows or shrinks, the browser test
            (e2e/p1667-landing-fable.spec.ts) fails on the card's position rather than this drifting. */}
        <div className="flex min-h-[calc(100svh-4rem)] flex-col pt-8 lg:col-span-7 lg:min-h-0 lg:pt-0">
          <div className="my-auto">
            <p className="mb-6 inline-flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.12em] sm:tracking-[0.2em] text-blue-700">
              <EyebrowIcon className="h-4 w-4 shrink-0" aria-hidden />
              {eyebrow}
            </p>
            {/* Tighter tracking below `sm` only: it keeps "In opposing directions." on one line at 375px. */}
            <h1 className="text-[2.1rem] sm:text-5xl xl:text-[3.5rem] font-semibold leading-[1.08] tracking-tighter sm:tracking-tight [&>span]:text-balance">{title}</h1>
            <p className="mt-6 max-w-xl border-l-2 border-blue-600 pl-5 text-xl lg:text-2xl font-medium text-foreground/70">{sub}</p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
              <AuditCTA location="hero" />
              <p className="text-foreground/70">
                or{" "}
                <Link to="/sign-pledge" onClick={() => pledge?.()} className="inline-flex min-h-10 items-center text-blue-600 underline underline-offset-4 hover:text-blue-700">
                  Take the Pledge
                </Link>
              </p>
            </div>
            {/* The shared strip centres its avatars over its caption; this hero is left-aligned. */}
            <div className="mt-6 flex justify-start">
              <PledgerAvatarStack className="!items-start" />
            </div>
          </div>
          {/* The only signpost to the example, so darker than the shared cue's default grey. */}
          <ScrollIndicator label="See an example" targetId="example" className="pb-5 pt-4 lg:hidden [&_button]:text-foreground/80 [&_svg]:text-foreground/70" />
        </div>
        <div id="example" className="-mx-4 scroll-mt-16 border-t border-border bg-muted/40 px-4 py-12 lg:col-span-5 lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
          <AgreedGraphic example={example} className="mx-auto max-w-md lg:max-w-none" />
        </div>
      </div>
      <ScrollIndicator label={nextLabel} targetId={nextId} className="hidden pb-6 lg:block" />
    </section>
  );
}

/** A dark band for the one number that should stop the scroll. */
export function StakesBand({ id, big, visual, children }: { id: string; big: ReactNode; visual: ReactNode; children: ReactNode }) {
  return (
    <section id={id} data-testid="stat-card" className="scroll-mt-16 bg-slate-950 px-4 py-16 text-white lg:py-32">
      <Reveal className={`${SHELL} grid items-end gap-10 lg:grid-cols-12`}>
        <p className="whitespace-nowrap text-[24vw] font-semibold leading-[0.8] tracking-tighter lg:col-span-6 lg:text-[10rem] xl:text-[11rem]">{big}</p>
        <div className="space-y-7 lg:col-span-6">
          {visual}
          <p className="text-xl font-medium leading-snug text-balance sm:text-2xl">{children}</p>
        </div>
      </Reveal>
    </section>
  );
}

/** "Why almost nobody verifies understanding": three reasons, lettered. `references` labels each citation for screen readers. */
export function ReasonsSection({ index, reasons, references, muted = false }: { index: string; reasons: Reason[]; references: Reference[]; muted?: boolean }) {
  return (
    <section className={`border-t border-border px-4 py-16 lg:py-28 ${muted ? "bg-muted/40" : ""}`}>
      <div className={SHELL}>
        <Reveal>
          <SectionHeading index={index} title={<>Why almost nobody <span className="text-blue-600">verifies</span> understanding</>} />
        </Reveal>
        <Indented>
          <motion.div variants={STAGGER} initial="hidden" whileInView="show" viewport={VIEWPORT_ONCE} className="grid gap-x-10 gap-y-10 sm:grid-cols-3">
            {reasons.map((r, i) => (
              <motion.div key={r.title} variants={RISE} className="border-t-2 border-foreground pt-5">
                <p className="font-mono text-xs tracking-[0.25em] text-blue-700" aria-hidden>
                  {String.fromCharCode(65 + i)}
                </p>
                <h3 className="mt-5 text-xl sm:text-2xl font-semibold tracking-tight">{r.title}</h3>
                <p className="mt-3 leading-relaxed text-foreground/75">
                  {r.text}
                  {r.refs.map((n) => (
                    <RefSup key={n} n={n} label={references.find((r) => r.n === n)?.label} />
                  ))}
                </p>
              </motion.div>
            ))}
          </motion.div>
        </Indented>
      </div>
    </section>
  );
}

/** The gap exchange: a centred chat exhibit with its own heading. `cast` carries the view event, so each page reports its own. */
export function ExchangeSection({ cast, muted = false }: { cast: ExchangeCast; muted?: boolean }) {
  return (
    <section className={`border-t border-border px-4 py-16 lg:py-28 ${muted ? "bg-muted/40" : ""}`}>
      <GapExchangeSection cast={cast} />
    </section>
  );
}

/** The norm in writing: the Clarity Group Terms specimen on a dark band. */
export function PromiseSection({ index, title, sub }: { index: string; title: ReactNode; sub?: string }) {
  const coa = COA_VERSIONS[CURRENT_COA_VERSION];
  return (
    <section className="overflow-hidden bg-slate-950 px-4 py-16 text-white lg:py-28">
      <div className={SHELL}>
        <Reveal>
          <SectionHeading index={index} tone="dark" title={title} sub={sub} />
        </Reveal>
        <Indented>
          <Reveal className="relative max-w-3xl text-foreground">
            <CertificateFrame ariaLabel="Clarity Group Terms" title={coa.title} kicker="A commitment to every member" epigraph="We all crave being understood. Let's commit to listen.">
              <CertificateOathBody sections={[coa.yourRight, coa.myPromise, coa.exception]} />
            </CertificateFrame>
            <TemplateStamp animate />
          </Reveal>
        </Indented>
      </div>
    </section>
  );
}

/** "How revealing gaps becomes a team norm": the workshop-fades chart beside the five-step path. */
export function NormSection({ index, muted = false }: { index: string; muted?: boolean }) {
  return (
    <section className={`border-t border-border px-4 py-16 lg:py-28 ${muted ? "bg-muted/40" : ""}`}>
      <div className={SHELL}>
        <Reveal>
          <SectionHeading index={index} title={<>How revealing gaps becomes a <span className="text-blue-600">team norm</span></>} />
        </Reveal>
        <Indented className="grid items-center gap-x-12 gap-y-10 lg:grid-cols-2">
          <Reveal>
            <NormChart />
          </Reveal>
          <motion.ol variants={STAGGER} initial="hidden" whileInView="show" viewport={VIEWPORT_ONCE} className="border-b border-foreground/15">
            {NORM_PATH.map((p, i) => (
              <motion.li key={p.title} variants={RISE} className="flex items-center gap-4 border-t border-foreground/15 py-4">
                <span className="w-7 shrink-0 font-mono text-xs tracking-[0.2em] text-blue-700" aria-hidden>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block text-lg font-semibold leading-snug">{p.title}</b>
                  <span className="text-foreground/75">{p.text}</span>
                </span>
                <span className="w-20 shrink-0 min-[360px]:w-24 sm:w-28">
                  <PeopleStrip {...p.strip} />
                </span>
              </motion.li>
            ))}
          </motion.ol>
        </Indented>
      </div>
    </section>
  );
}

/** The closing band: one statement and the page's single action again. */
export function CloseSection({ lead, title }: { lead?: string; title: string }) {
  return (
    <section className="overflow-hidden bg-blue-600 px-4 py-24 text-white lg:py-32">
      <Reveal className={SHELL}>
        <h2 className="max-w-4xl text-[1.75rem] sm:text-5xl lg:text-6xl font-semibold leading-[1.1] tracking-tight text-balance break-words">
          {lead && <span className="block text-blue-100">{lead}</span>}
          <span className="block">{title}</span>
        </h2>
        <div className="mt-10">
          <AuditCTA location="closing" tone="inverse" />
        </div>
      </Reveal>
    </section>
  );
}

export function ReferencesSection({ references }: { references: Reference[] }) {
  return (
    <section id="references" className="scroll-mt-16 px-4 py-12">
      <div className={SHELL}>
        <p className="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">References</p>
        <ol className="text-sm text-muted-foreground lg:columns-2 lg:gap-x-10">
          {references.map((r) => (
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
  );
}
