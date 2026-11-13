/**
 * The hero of the fable layout (P1667, P1670; options added in P1674). Two shapes:
 *
 *   - with an `example`: the text beside the wordless drawing (/builders, /change-managers,
 *     /hospitals, /communities, and /hiring, /coach, /founder with two people). On a phone the text column fills the first screen and ends at
 *     the scroll cue, so the example starts on the second screen as its own band and is never cut
 *     by the fold. From `lg` up the example sits beside the text.
 *   - without one: text only, across the full content width (no page uses it since P1674's two-person drawings).
 *
 * Every option defaults to what /builders and /change-managers render: the discovery-call button
 * with the "Take the Pledge" link, a plain sub-line, and the page's scroll cue.
 */
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ScrollIndicator, PledgerAvatarStack } from "@/app/components/landing/social-proof";
import { AgreedGraphic } from "./fable-agreed";
import { SHELL, type AgreedExample } from "./fable-content";
import { AuditCTA, OrLink } from "./fable-parts";
import { useFableTracking } from "./fable-tracking";

type HeroProps = {
  eyebrow: string;
  EyebrowIcon: LucideIcon;
  title: ReactNode;
  /** The line under the headline; may carry a citation or several lines. Omitted: no sub-line. */
  sub?: ReactNode;
  /** The wordless drawing. Omitted: the text-only, full-width hero. */
  example?: AgreedExample;
  /** Where the scroll cue points, and what it says. Both omitted: the untargeted arrow (/coach). */
  nextId?: string;
  nextLabel?: string;
  /** The page's own actions. Omitted: the discovery call and "or Take the Pledge". */
  actions?: ReactNode;
};

/** The discovery call and the quiet pledge link, as /builders and /change-managers have them. */
function DefaultActions() {
  const { pledge } = useFableTracking();
  return (
    <>
      <AuditCTA location="hero" />
      <OrLink to="/sign-pledge" onClick={() => pledge?.()}>
        Take the Pledge
      </OrLink>
    </>
  );
}

function HeroText({ eyebrow, EyebrowIcon, title, sub, actions, wide }: Pick<HeroProps, "eyebrow" | "EyebrowIcon" | "title" | "sub" | "actions"> & { wide: boolean }) {
  return (
    <div className="my-auto">
      <p className="mb-6 inline-flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.12em] sm:tracking-[0.2em] text-blue-700">
        <EyebrowIcon className="h-4 w-4 shrink-0" aria-hidden />
        {eyebrow}
      </p>
      {/* Tighter tracking below `sm` only: it keeps "In opposing directions." on one line at 375px. */}
      <h1
        className={
          wide
            ? "max-w-5xl text-[2.1rem] sm:text-5xl lg:text-6xl xl:text-[4.25rem] font-semibold leading-[1.08] tracking-tighter sm:tracking-tight [&>span]:text-balance"
            : "text-[2.1rem] sm:text-5xl xl:text-[3.5rem] font-semibold leading-[1.08] tracking-tighter sm:tracking-tight [&>span]:text-balance"
        }
      >
        {title}
      </h1>
      {sub && (
        <p className={`mt-6 ${wide ? "max-w-2xl" : "max-w-xl"} border-l-2 border-blue-600 pl-5 text-xl lg:text-2xl font-medium text-foreground/70`}>{sub}</p>
      )}
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">{actions ?? <DefaultActions />}</div>
      {/* The shared strip centres its avatars over its caption; this hero is left-aligned. */}
      <div className="mt-6 flex justify-start">
        <PledgerAvatarStack className="!items-start" />
      </div>
    </div>
  );
}

/** The cue to the next section: labelled and targeted, or the untargeted arrow when the page has none. */
function NextCue({ nextId, nextLabel, className }: { nextId?: string; nextLabel?: string; className: string }) {
  return nextId && nextLabel ? <ScrollIndicator label={nextLabel} targetId={nextId} className={className} /> : <ScrollIndicator className={className} />;
}

export function FableHero({ example, nextId, nextLabel, ...text }: HeroProps) {
  if (!example) {
    return (
      <section className="relative flex min-h-[calc(100svh-4rem)] flex-col overflow-hidden px-4 lg:min-h-[calc(100vh-5rem)]">
        <div className={`${SHELL} flex flex-1 flex-col pt-8 lg:py-8`}>
          <HeroText {...text} wide />
        </div>
        <NextCue nextId={nextId} nextLabel={nextLabel} className="pb-5 pt-4 lg:pb-6" />
      </section>
    );
  }
  return (
    <section className="relative flex flex-col overflow-hidden px-4 lg:min-h-[calc(100vh-5rem)]">
      <div className={`${SHELL} grid gap-x-12 lg:flex-1 lg:grid-cols-12 lg:items-center lg:py-8`}>
        {/* 4rem is the site menu's height below `lg`. If the menu grows or shrinks, the browser test
            (e2e/p1667-landing-fable.spec.ts) fails on the card's position rather than this drifting. */}
        <div className="flex min-h-[calc(100svh-4rem)] flex-col pt-8 lg:col-span-7 lg:min-h-0 lg:pt-0">
          <HeroText {...text} wide={false} />
          {/* The only signpost to the example, so darker than the shared cue's default grey. */}
          <ScrollIndicator label="See an example" targetId="example" className="pb-5 pt-4 lg:hidden [&_button]:text-foreground/80 [&_svg]:text-foreground/70" />
        </div>
        <div id="example" className="-mx-4 scroll-mt-16 border-t border-border bg-muted/40 px-4 py-12 lg:col-span-5 lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
          <AgreedGraphic example={example} className="mx-auto max-w-md lg:max-w-none" />
        </div>
      </div>
      <NextCue nextId={nextId} nextLabel={nextLabel} className="hidden pb-6 lg:block" />
    </section>
  );
}
