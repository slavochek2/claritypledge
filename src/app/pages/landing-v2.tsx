/**
 * Landing V2 — "The Confession"
 *
 * Artistic redesign targeting co-founder pairs.
 * Design philosophy: Raw, narrative-driven, typography-led.
 * Dark warm palette. No icons. No badges. Just truth.
 *
 * Prototype: accessible at /tree/landing-v2
 */
import { useState, useEffect, useRef } from "react";

// --- Animated text that fades in line by line ---
function RevealLine({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <span
      className={`block transition-all duration-700 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      } ${className}`}
    >
      {children}
    </span>
  );
}

// --- Section that fades in on scroll ---
function ScrollReveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
    >
      {children}
    </div>
  );
}

// --- The Gap Visualizer ---
function GapVisualizer() {
  const [confidence, setConfidence] = useState(82);
  const reality = Math.max(0, confidence - 35 + Math.floor(Math.random() * 10));

  return (
    <div className="max-w-md mx-auto space-y-6">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-amber-200/70">
            "How well did I understand?"
          </span>
          <span className="text-amber-300 font-mono">{confidence}%</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all duration-500"
            style={{ width: `${confidence}%` }}
          />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-amber-200/70">"How well did they actually?"</span>
          <span className="text-red-400 font-mono">{reality}%</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-red-500 rounded-full transition-all duration-500"
            style={{ width: `${reality}%` }}
          />
        </div>
      </div>
      <div className="text-center pt-2">
        <input
          type="range"
          min={40}
          max={100}
          value={confidence}
          onChange={(e) => setConfidence(Number(e.target.value))}
          className="w-full accent-amber-400 cursor-pointer"
        />
        <p className="text-xs text-stone-500 mt-1">
          Drag to see how confidence hides the gap
        </p>
      </div>
    </div>
  );
}

// --- Main Landing ---
export function LandingV2() {
  return (
    <div className="bg-stone-950 text-stone-100 min-h-screen selection:bg-amber-500/30">
      {/* ===== SECTION 1: THE OPENING ===== */}
      <section className="min-h-screen flex items-center justify-center px-6">
        <div className="max-w-3xl text-center space-y-2">
          <RevealLine
            delay={200}
            className="text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-stone-300"
          >
            We agreed on the vision.
          </RevealLine>
          <RevealLine
            delay={800}
            className="text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-stone-300"
          >
            We agreed on the strategy.
          </RevealLine>
          <RevealLine
            delay={1400}
            className="text-3xl sm:text-5xl lg:text-6xl font-light tracking-tight text-stone-300"
          >
            We agreed on who does what.
          </RevealLine>

          <RevealLine delay={2400} className="pt-6">
            <span className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-amber-400">
              We were wrong about all of it.
            </span>
          </RevealLine>

          <RevealLine
            delay={3400}
            className="pt-8 text-lg text-stone-500 font-light"
          >
            65% of startups fail because co-founders weren't actually aligned.
            <br className="hidden sm:block" />
            Not because they fought. Because they{" "}
            <em className="text-stone-400">assumed</em> they understood each
            other.
          </RevealLine>

          <RevealLine delay={4000} className="pt-12">
            <svg
              className="w-5 h-5 mx-auto text-stone-600 animate-bounce"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </RevealLine>
        </div>
      </section>

      {/* ===== SECTION 2: THE SPLIT — Same words, different meaning ===== */}
      <section className="py-24 sm:py-32 px-6">
        <ScrollReveal>
          <div className="max-w-4xl mx-auto">
            <h2 className="text-center text-2xl sm:text-3xl font-light text-stone-400 mb-16">
              The same conversation. Two different realities.
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-px bg-stone-800/50 rounded-xl overflow-hidden">
              {/* Co-founder A */}
              <div className="bg-stone-900 p-8 sm:p-12 space-y-6">
                <p className="text-xs uppercase tracking-widest text-amber-400/60">
                  Co-founder A hears
                </p>
                <blockquote className="text-xl sm:text-2xl font-light text-stone-200 leading-relaxed border-l-2 border-amber-400/30 pl-6">
                  "We need to move faster."
                </blockquote>
                <p className="text-stone-400 text-sm leading-relaxed">
                  Meaning: "Let's cut scope. Ship the MVP this week. Stop
                  perfecting features nobody asked for."
                </p>
              </div>

              {/* Co-founder B */}
              <div className="bg-stone-900/70 p-8 sm:p-12 space-y-6">
                <p className="text-xs uppercase tracking-widest text-red-400/60">
                  Co-founder B hears
                </p>
                <blockquote className="text-xl sm:text-2xl font-light text-stone-200 leading-relaxed border-l-2 border-red-400/30 pl-6">
                  "We need to move faster."
                </blockquote>
                <p className="text-stone-400 text-sm leading-relaxed">
                  Meaning: "Hire two more engineers. We're
                  under-resourced. The product needs more features to compete."
                </p>
              </div>
            </div>

            <p className="text-center text-stone-500 text-sm mt-8 max-w-lg mx-auto">
              Both walk away thinking they agreed. Three months later, it
              explodes. This is a{" "}
              <span className="text-amber-400">false agreement</span> — and
              it's invisible until it's expensive.
            </p>
          </div>
        </ScrollReveal>
      </section>

      {/* ===== SECTION 3: THE MEASUREMENT ===== */}
      <section className="py-24 sm:py-32 px-6 bg-stone-900/50">
        <ScrollReveal>
          <div className="max-w-3xl mx-auto text-center space-y-12">
            <div className="space-y-4">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
                What if you could{" "}
                <span className="text-amber-400">measure</span> alignment?
              </h2>
              <p className="text-lg text-stone-400 font-light max-w-xl mx-auto">
                Not a feeling. Not a survey. A number. The gap between "how well
                I think I understood" and how well I actually did — verified by
                the other person.
              </p>
            </div>

            <GapVisualizer />
          </div>
        </ScrollReveal>
      </section>

      {/* ===== SECTION 4: THE FOUNDER (Credibility through vulnerability) ===== */}
      <section className="py-24 sm:py-32 px-6">
        <ScrollReveal>
          <div className="max-w-2xl mx-auto">
            <div className="space-y-8">
              {/* The Numbers — raw */}
              <div className="space-y-1 text-center">
                <p className="text-5xl sm:text-7xl font-bold text-stone-200 tracking-tight">
                  14
                </p>
                <p className="text-stone-500 text-sm">co-founders</p>
              </div>

              <div className="flex justify-center gap-12 sm:gap-16">
                <div className="text-center space-y-1">
                  <p className="text-3xl sm:text-4xl font-bold text-stone-300">
                    6
                  </p>
                  <p className="text-stone-500 text-xs">years</p>
                </div>
                <div className="text-center space-y-1">
                  <p className="text-3xl sm:text-4xl font-bold text-stone-300">
                    €398k
                  </p>
                  <p className="text-stone-500 text-xs">raised</p>
                </div>
                <div className="text-center space-y-1">
                  <p className="text-3xl sm:text-4xl font-bold text-stone-300">
                    1
                  </p>
                  <p className="text-stone-500 text-xs">bankruptcy</p>
                </div>
              </div>

              {/* The Story */}
              <div className="border-t border-stone-800 pt-8 space-y-6">
                <p className="text-lg sm:text-xl text-stone-300 font-light leading-relaxed">
                  I didn't lose my companies because we fought. I lost them
                  because we{" "}
                  <em className="text-amber-400 not-italic font-medium">
                    agreed
                  </em>{" "}
                  — on things we hadn't actually understood.
                </p>
                <p className="text-stone-400 leading-relaxed">
                  Every time, it looked like alignment. We nodded at the same
                  slides. Used the same words. Felt good about the meeting.
                  Months later, reality hit: we meant completely different
                  things. By then, trust was already gone.
                </p>
                <p className="text-stone-400 leading-relaxed">
                  I spent 9 years studying why. The answer was simple: nobody
                  checks whether understanding actually happened. We have legal
                  due diligence. Financial due diligence. But zero alignment due
                  diligence.
                </p>
                <p className="text-stone-300 font-medium">
                  So I built the instrument to measure it.
                </p>
              </div>

              {/* Author */}
              <div className="flex items-center gap-4 pt-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center text-white font-bold text-lg">
                  V
                </div>
                <div>
                  <p className="text-stone-200 font-medium">
                    Vyacheslav Ladischenski
                  </p>
                  <p className="text-stone-500 text-sm">
                    Founder, ClarityPledge
                  </p>
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ===== SECTION 5: HOW IT WORKS — Not features. A ritual. ===== */}
      <section className="py-24 sm:py-32 px-6 bg-stone-900/50">
        <ScrollReveal>
          <div className="max-w-3xl mx-auto space-y-16">
            <h2 className="text-center text-3xl sm:text-4xl font-bold tracking-tight">
              60 minutes. One real decision.
              <br />
              <span className="text-amber-400">The truth about your alignment.</span>
            </h2>

            {/* The Steps — minimal, narrative */}
            <div className="space-y-12">
              {[
                {
                  num: "01",
                  title: "You pick a real decision",
                  body: "Not a hypothetical. The decision you've been circling. Strategy, hiring, fundraising — something that matters.",
                },
                {
                  num: "02",
                  title: "Each explains what they heard",
                  body: 'Your co-founder explains back what they understood you to mean. Not parroting words — explaining the reasoning behind your position. Then you do the same.',
                },
                {
                  num: "03",
                  title: "Both rate their confidence",
                  body: '"How well do I think I understood?" A number, 0-10. Honest. Private until compared.',
                },
                {
                  num: "04",
                  title: "Reality appears",
                  body: "The speaker rates how well they were actually understood. The gap between confidence and reality is your calibration score. This is the moment most founders say: \"I had no idea.\"",
                },
              ].map((step) => (
                <div key={step.num} className="flex gap-6 sm:gap-8">
                  <div className="shrink-0 text-2xl font-mono text-amber-400/40 pt-1">
                    {step.num}
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl sm:text-2xl font-medium text-stone-200">
                      {step.title}
                    </h3>
                    <p className="text-stone-400 leading-relaxed">
                      {step.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ===== SECTION 6: WHAT YOU WALK AWAY WITH ===== */}
      <section className="py-24 sm:py-32 px-6">
        <ScrollReveal>
          <div className="max-w-3xl mx-auto space-y-12">
            <h2 className="text-center text-2xl sm:text-3xl font-light text-stone-300">
              After one session, you'll know:
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
              {[
                {
                  label: "Where you actually agree",
                  detail: "Confirmed alignment — stop revisiting it",
                },
                {
                  label: "Where you only think you agree",
                  detail: "The false agreements hiding in plain sight",
                },
                {
                  label: "Where you disagree productively",
                  detail: "Real disagreements you can now resolve clearly",
                },
              ].map((item) => (
                <div key={item.label} className="space-y-3">
                  <p className="text-lg font-medium text-amber-400">
                    {item.label}
                  </p>
                  <p className="text-sm text-stone-500">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ===== SECTION 7: PRICE LADDER — honest, not salesy ===== */}
      <section className="py-24 sm:py-32 px-6 bg-stone-900/50">
        <ScrollReveal>
          <div className="max-w-2xl mx-auto space-y-12">
            <h2 className="text-center text-3xl sm:text-4xl font-bold tracking-tight">
              Start where it feels right
            </h2>

            <div className="space-y-6">
              {/* Free */}
              <div className="border border-stone-800 rounded-lg p-6 sm:p-8 hover:border-stone-700 transition-colors">
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="text-xl font-medium text-stone-200">
                    Free Workshop
                  </h3>
                  <span className="text-stone-500 text-sm">Free</span>
                </div>
                <p className="text-stone-400 text-sm leading-relaxed">
                  Experience your own calibration gap in a group setting. You'll
                  discover how often you think you understood — and didn't. No
                  commitment. Just awareness.
                </p>
              </div>

              {/* €199 */}
              <div className="border border-amber-400/30 rounded-lg p-6 sm:p-8 bg-amber-400/5">
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="text-xl font-medium text-amber-300">
                    Co-founder Alignment Check
                  </h3>
                  <span className="text-amber-400 font-mono">€199</span>
                </div>
                <p className="text-stone-400 text-sm leading-relaxed">
                  One session. One real decision. Surface the false agreements
                  hiding between you and your co-founder. 60 minutes with both
                  of you.
                </p>
              </div>

              {/* €950 */}
              <div className="border border-stone-800 rounded-lg p-6 sm:p-8 hover:border-stone-700 transition-colors">
                <div className="flex items-baseline justify-between mb-3">
                  <h3 className="text-xl font-medium text-stone-200">
                    Co-founder De-risking
                  </h3>
                  <span className="text-stone-400 font-mono">€950</span>
                </div>
                <p className="text-stone-400 text-sm leading-relaxed">
                  Two sessions + a Clarity Partnership Agreement. Establish a
                  calibration habit between you. Know where you stand — and keep
                  checking.
                </p>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ===== SECTION 8: FINAL CTA ===== */}
      <section className="py-32 sm:py-40 px-6">
        <ScrollReveal>
          <div className="max-w-2xl mx-auto text-center space-y-8">
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight leading-tight">
              Stop assuming you're aligned.
              <br />
              <span className="text-amber-400">Test it.</span>
            </h2>

            <p className="text-stone-400 text-lg font-light max-w-lg mx-auto">
              The conversation you need to have is the one you think you already
              had.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <a
                href="https://ladischenski.com"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-3.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold rounded-lg transition-colors text-lg"
              >
                Book an Alignment Check
              </a>
              <a
                href="/events"
                className="px-8 py-3.5 border border-stone-700 hover:border-stone-500 text-stone-300 rounded-lg transition-colors"
              >
                Join a Free Workshop
              </a>
            </div>

            <p className="text-stone-600 text-xs pt-4">
              No app to learn. No prep needed. Just bring your co-founder and a
              real decision.
            </p>
          </div>
        </ScrollReveal>
      </section>

      {/* ===== FOOTER — minimal ===== */}
      <footer className="border-t border-stone-800/50 py-12 px-6">
        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-stone-600">
          <span>ClarityPledge</span>
          <div className="flex gap-6">
            <a href="/about" className="hover:text-stone-400 transition-colors">
              About
            </a>
            <a
              href="/manifesto"
              className="hover:text-stone-400 transition-colors"
            >
              Manifesto
            </a>
            <a
              href="https://github.com/slavochek2/claritypledge"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-stone-400 transition-colors"
            >
              Open Source
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
