/**
 * /hospitals — P1506. Share-by-link use-case page for people from the health industry.
 *
 * Copy is the English page of the hospital brochure, verbatim (layout and line breaks only);
 * deviations are listed in the spec's build notes. Unlisted: noIndex, no nav item, no sitemap
 * entry. Clarity Pledge is the subject throughout — no first-person service offer.
 * Exactly one primary CTA ("Book a 15-min discovery call" → /intro); the email is a plain link.
 */
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { CalendarIcon } from "lucide-react";
import { SEO } from "@/app/components/seo";
import { analytics } from "@/lib/mixpanel";
import { HospitalIcon, PeopleStrip, type HospitalIconName } from "@/app/components/hospitals/hospital-icons";
import { GapExchangeSection } from "@/app/components/hospitals/gap-exchange";
import { HOSPITALS_OG } from "@/app/content/hospitals-og";


export const SOURCES = [
  {
    n: 1,
    cite: "HA Thailand (Healthcare Accreditation Institute), Patient Safety Goals, P2 Communication",
    url: "https://backend.ha.or.th/fileupload/DOCUMENT/00537/7639551a-50b9-459c-9ff3-98f65c3d8cb8.pdf",
  },
  {
    n: 2,
    cite: "CRICO Strategies, Malpractice Risks in Communication Failures, 2015",
    url: "https://www.rmf.harvard.edu/News-and-Blog/Press-Releases-Home/Press-Releases/2016/February/Failures-in-Communication-Contribute-to-Medical-Malpractice",
  },
] as const;

const VALUES: { icon: HospitalIconName; text: string }[] = [
  { icon: "shield", text: "Fewer mistakes and rework" },
  { icon: "star", text: "Better patient experience" },
  { icon: "scale", text: "Better decisions" },
  { icon: "stay", text: "Lower staff turnover" },
];

const CASES: { icon: HospitalIconName; text: string }[] = [
  { icon: "dept", text: "Between departments" },
  { icon: "rank", text: "Across seniority" },
  { icon: "heart", text: "Patients and families" },
  { icon: "globe", text: "International patients" },
  { icon: "case", text: "Vendor and investment choices" },
  { icon: "change", text: "Introducing change" },
];

const PATH = [
  { title: "See the cost", text: "Where gaps cost the most.", strip: { blue: [], questions: [1, 3] } },
  { title: "Find champions", text: "People who naturally reveal gaps.", strip: { blue: [1] } },
  { title: "Spread", text: "In important meetings, with support.", strip: { blue: [1, 2, 3] } },
  { title: "Norm", text: "Checking before key decisions is expected.", strip: { blue: [0, 1, 2, 3, 4] } },
  { title: "Maintain", text: "New staff onboard fast, digitally.", strip: { blue: [0, 1, 2, 3, 4], plus: true } },
];

const NAVY = "text-[#1e3a5f]";

/** Inline citation: superscript number + author/year/title, linked to the primary source. */
function Cite({ n }: { n: 1 | 2 }) {
  const s = SOURCES[n - 1];
  return (
    <sup className="ml-0.5">
      <a href={s.url} target="_blank" rel="noopener noreferrer" title={s.cite} aria-label={`Source ${n}: ${s.cite}`} className="inline-block px-2 py-5 -mx-2 -my-5 text-blue-600 hover:text-blue-700">
        {n}
      </a>
    </sup>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className={`text-xl sm:text-2xl font-bold ${NAVY} border-b border-slate-200 pb-2 mb-5`}>{children}</h2>;
}

function PrimaryCTA() {
  return (
    <Link
      to="/intro"
      onClick={() => analytics.track("hospitals_cta_clicked", { location: "hero" })}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-500 hover:bg-blue-700 text-white font-semibold shadow-lg shadow-blue-500/20 px-6 sm:px-8 py-4 text-base"
    >
      <CalendarIcon className="w-5 h-5 shrink-0" />
      Book a 15-min discovery call
    </Link>
  );
}

/** Workshop-impact-fades vs team-norm chart, with a text alternative. */
function NormChart() {
  return (
    <figure className="w-full max-w-sm">
      <svg viewBox="0 0 200 60" className="w-full h-auto" role="img" aria-labelledby="norm-chart-desc">
        <line x1="8" y1="48" x2="196" y2="48" stroke="#e5e7eb" />
        <path d="M8 46 C30 46 34 12 46 12 C60 12 66 42 110 45 L196 46" fill="none" stroke="#9ca3af" strokeWidth="2.2" />
        <path d="M8 46 C50 44 80 32 110 22 C140 13 170 11 196 10" fill="none" stroke="#2563eb" strokeWidth="2.6" />
        <text x="52" y="9" fontSize="9" fill="#4b5563">One-off workshop</text>
        <text x="196" y="26" textAnchor="end" fontSize="9" fill="#2563eb" fontWeight="700">Team norm</text>
        <text x="196" y="58" textAnchor="end" fontSize="8.5" fill="#6b7280">time &rarr;</text>
        <text x="8" y="58" fontSize="8.5" fill="#6b7280">in use</text>
      </svg>
      <figcaption id="norm-chart-desc" className="sr-only">
        Chart of how much the practice is in use over time: after a one-off workshop, use peaks and then fades back to
        near zero; as a team norm, use rises steadily and stays high.
      </figcaption>
    </figure>
  );
}

export function HospitalsPage() {
  useEffect(() => {
    analytics.track("landing_page_viewed", { variant: "hospitals" });
  }, []);

  return (
    <div className="bg-white text-slate-800">
      <SEO title={HOSPITALS_OG.title} description={HOSPITALS_OG.description} url="/hospitals" image={HOSPITALS_OG.image} noIndex />

      {/* 1. Hero */}
      <section className="px-4 pt-12 pb-10 sm:pt-20">
        <div className="container mx-auto max-w-4xl">
          <h1 className={`font-['Playfair_Display',Georgia,serif] text-3xl sm:text-5xl font-bold leading-[1.12] ${NAVY} text-balance`}>
            Reveal gaps in understanding between hospital staff <em className="not-italic text-blue-600">before</em> they become mistakes
          </h1>
          <p className="mt-5 text-lg sm:text-xl text-slate-700">Clarity Pledge helps hospital teams establish and maintain one new team norm:</p>
          <p className="mt-4 border-l-4 border-blue-600 bg-blue-50 rounded-r-xl px-5 py-4 font-['Playfair_Display',Georgia,serif] text-2xl sm:text-3xl font-bold text-blue-600">
            Make it normal to ask how well we understand each other
          </p>
          <div className="mt-8">
            <PrimaryCTA />
          </div>
        </div>
      </section>

      {/* 2. Outcomes */}
      <section className="px-4 py-8">
        <div className="container mx-auto max-w-4xl">
          <SectionTitle>What the hospital can expect</SectionTitle>
          <ul className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-4 gap-4">
            {VALUES.map((v) => (
              <li key={v.text} className={`flex items-center gap-3 font-semibold ${NAVY}`}>
                <HospitalIcon name={v.icon} className="w-7 h-7 shrink-0 text-blue-600" />
                {v.text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 3. Why gaps stay invisible + stat */}
      <section className="px-4 py-8">
        <div className="container mx-auto max-w-4xl">
          <SectionTitle>Why gaps in mutual understanding stay invisible</SectionTitle>
          <div className="grid gap-6 md:grid-cols-[1.35fr_1fr] items-center">
            <p className="text-slate-700 leading-relaxed">
              Saying how much you really understood, or asking a colleague how much they did, can feel awkward or
              disrespectful, especially across seniority. So people nod, and the gap surfaces later. Read-back already
              protects clinical orders.<Cite n={1} /> Everyday conversations have no such habit.
            </p>
            <div className="rounded-xl bg-blue-50 p-5 flex gap-4 items-center" data-testid="stat-card">
              <div className="font-['Playfair_Display',Georgia,serif] text-5xl font-bold text-blue-600 leading-none">30%</div>
              <p className="text-slate-700 text-sm">
                of 23,658 US malpractice cases studied involved a communication failure.<Cite n={2} />
                <span className="block mt-1 text-xs text-slate-500">
                  <a href={SOURCES[1].url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-slate-700">
                    CRICO Strategies (2015), <i>Malpractice Risks in Communication Failures</i>
                  </a>
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Interactive exchange */}
      <section className="px-4 py-8" aria-label="Revealing a gap">
        <div className="container mx-auto max-w-4xl">
          <GapExchangeSection />
        </div>
      </section>

      {/* 5. Use cases */}
      <section className="px-4 py-8">
        <div className="container mx-auto max-w-4xl">
          <SectionTitle>Where gaps in understanding cost most</SectionTitle>
          <ul className="grid grid-cols-1 min-[400px]:grid-cols-2 md:grid-cols-3 gap-4">
            {CASES.map((c) => (
              <li key={c.text} className={`flex items-center gap-3 font-semibold ${NAVY}`}>
                <HospitalIcon name={c.icon} className="w-7 h-7 shrink-0 text-blue-600" />
                {c.text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 6. Five-step path */}
      <section className="px-4 py-8">
        <div className="container mx-auto max-w-4xl">
          <SectionTitle>How revealing gaps becomes a team norm</SectionTitle>
          <ol className="relative grid grid-cols-1 sm:grid-cols-5 gap-6 sm:gap-2">
            <div aria-hidden="true" className="hidden sm:block absolute left-[10%] right-[10%] top-[3.1rem] h-0.5 bg-blue-200" />
            <div aria-hidden="true" className="sm:hidden absolute left-[1.05rem] top-4 bottom-4 w-0.5 bg-blue-200" />
            {PATH.map((p, i) => (
              <li key={p.title} className="relative flex sm:block gap-4 items-start sm:text-center">
                <div className="hidden sm:block"><PeopleStrip {...p.strip} /></div>
                <div className="relative shrink-0 w-[2.1rem] h-[2.1rem] sm:w-7 sm:h-7 sm:mx-auto sm:my-2 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center">
                  {i + 1}
                </div>
                <div>
                  <div className="sm:hidden -ml-1 mb-1 w-28"><PeopleStrip {...p.strip} /></div>
                  <b className={`block ${NAVY}`}>{p.title}</b>
                  <span className="text-sm text-slate-600">{p.text}</span>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 7. How it's different */}
      <section className="px-4 py-8">
        <div className="container mx-auto max-w-4xl">
          <SectionTitle>How Clarity Pledge is different</SectionTitle>
          <div className="grid gap-6 md:grid-cols-[1.6fr_1fr] items-center">
            <p className={`text-lg font-semibold ${NAVY} leading-relaxed`}>
              The impact of a one-off communication workshop fades.
              <span className="block mt-2 text-xl font-bold text-blue-600">Clarity Pledge helps teams establish and keep this norm.</span>
            </p>
            <NormChart />
          </div>
        </div>
      </section>

      {/* 8. Founder + sources */}
      <section className="px-4 py-10">
        <div className="container mx-auto max-w-4xl border-t border-slate-200 pt-8">
          <div className="flex items-center gap-4">
            <img
              src="/founder-photo.jpg"
              alt="Vyacheslav Ladischenski (Slava), founder of Clarity Pledge"
              className="w-16 h-16 rounded-full object-cover shrink-0"
              loading="lazy"
            />
            <div className="text-sm text-slate-600 min-w-0">
              <b className={`block text-base ${NAVY}`}>Vyacheslav Ladischenski (Slava)</b>
              Founder
              <span className="block break-words">
                <a href="mailto:slava@claritypledge.com" className="text-blue-700 underline underline-offset-2 inline-block py-2.5">slava@claritypledge.com</a>
                <span aria-hidden="true"> &middot; </span>
                <a href="https://linkedin.com/in/ladischenski" target="_blank" rel="noopener noreferrer" className="text-blue-700 underline underline-offset-2 inline-block py-2.5">
                  linkedin.com/in/ladischenski
                </a>
              </span>
            </div>
          </div>

          <div id="sources" className="mt-8">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Sources</p>
            <ol className="text-xs text-slate-500 space-y-1.5">
              {SOURCES.map((s) => (
                <li key={s.n} className="flex gap-1.5">
                  <span className="shrink-0">{s.n}.</span>
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-block py-3 underline underline-offset-2 hover:text-slate-700">{s.cite}</a>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}

export default HospitalsPage;
