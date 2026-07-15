/**
 * Hard-truth chat — shared WhatsApp-style "the honest message that stayed unsent"
 * mockup (presi chat-timeline port). Two POV variants via `variant`:
 *
 * - "you-withheld" (default): the honest message is TYPED into a live bubble,
 *   then hesitated over, struck through (red), and collapsed into "You deleted
 *   this message" — the motion IS the point: the truth was hard to say, so it
 *   stayed unsent.
 * - "they-withheld": the viewer is the founder; the counterpart's honest reply
 *   never became a chat message at all, so it can't render as one. Instead it
 *   renders as "The Seam" — a full-bleed strip that breaks the chat wallpaper
 *   (bg-muted, hairline top/bottom borders, no bubble/tail/shadow — bg-muted,
 *   not bg-background, because bg-background is pure white and is indistinguishable
 *   from the white received/sent bubbles it sits between) showing
 *   what was typed on the counterpart's phone and never sent. Unlike the old
 *   "typing…" tell this replaced, the Seam does not fade away once revealed —
 *   it is the payload of the beat and must stay legible at rest, including for
 *   reduced-motion users who land directly on the final state.
 *
 * Reduced-motion users get the final state for either variant, no animation.
 *
 * Used by / (program-page.tsx, variant="they-withheld") and /founder
 * (default variant="you-withheld" — old-landing-2 passes no `variant`, so it is
 * unaffected by this prop). The two variants also have separate phase schedules —
 * see the useEffect below; "they-withheld" must not inherit the other's timing.
 * All content is passed via props. NOTE: green/beige
 * hex are WhatsApp brand colors; the red consequence wash + strike mirror presi's
 * "soft danger" treatment — scoped here.
 *
 * Self-wraps in MotionConfig reducedMotion="user" so reduced-motion behavior is identical
 * wherever it's mounted (the coach page has no page-level MotionConfig — and does not
 * consume this component; /coach has its own local HardTruthChat, verified P987).
 */
import { useState, useRef, useEffect, type ReactNode } from "react";
import { BanIcon, BrainIcon } from "lucide-react";
import { motion, useInView, useReducedMotion, animate, MotionConfig } from "framer-motion";
import { SectionHeader } from "@/app/components/landing/section-header";

export interface HardTruthChatProps {
  /** Which side withheld the honest message. "you-withheld" (default) is the
   *  original typed-then-deleted beat; "they-withheld" flips the POV to the
   *  founder, revealing the counterpart's unsent honest reply via "The Seam"
   *  (see file docstring). Omitting this prop (old-landing-2's usage)
   *  preserves the original behavior unchanged. */
  variant?: "you-withheld" | "they-withheld";
  /** Section heading above the chat. Defaults to the original shared heading —
   *  pass a scenario-specific heading to override without affecting other callers. */
  heading?: ReactNode;
  /** Contact name in the chat header — who you're messaging. */
  contact: string;
  /** Subtitle line under the contact name in the chat header (e.g. their role).
   *  Defaults to the original "last seen recently" — unaffected callers keep
   *  the original chrome unchanged. */
  subtitle?: string;
  /** "you-withheld": the message they sent you (received, left, white bubble).
   *  "they-withheld": the message YOU sent them (right, green bubble). */
  received: string;
  /** The honest reply that stayed unsent. "you-withheld": TYPE then delete
   *  in-chat (typed char-by-char, struck, then collapsed). "they-withheld":
   *  never rendered as a chat bubble — WhatsApp can't show a message that was
   *  never sent — it renders in "The Seam", a full-bleed strip inside the
   *  chat body that breaks the wallpaper (see file docstring). */
  honest: string;
  /** The bland reply sent instead. "you-withheld": right, green bubble (you
   *  sent it). "they-withheld": left, white bubble (they sent it). */
  sent: string;
  /** The consequence pill (red "soft danger" wash). */
  consequence: string;
  /** Thought-cloud heading (the question). */
  thoughtTitle: string;
  /** Thought-cloud body (why the honest message stayed unsent). */
  thoughtBody: string;
  /** Avatar shown in the chat header. Defaults to the customer/co-founder photo. */
  avatarSrc?: string;
}

export function HardTruthChat({
  variant = "you-withheld",
  heading = <>When the hard truth is <span className="text-blue-500">difficult to say</span></>,
  contact,
  subtitle = "last seen recently",
  received,
  honest,
  sent,
  consequence,
  thoughtTitle,
  thoughtBody,
  avatarSrc = "/customer-avatar.jpg",
}: HardTruthChatProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  // phase: 0 idle · 1 received · 2 typing(live) · 3 hesitate · 4 struck · 5 deleted · 6 reply · 7 consequence
  const [phase, setPhase] = useState(0);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (reduce) {
      setPhase(7);
      setTyped(honest);
      return;
    }
    if (!inView) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    if (variant === "they-withheld") {
      // This variant renders only phases 1/3/6/7 — it has no typing, strike-through or
      // collapse beat. It must NOT inherit "you-withheld"'s schedule below, which spends
      // ~2.2s advancing through phases that draw nothing here, pushing the Seam (the
      // payload) to 2.75s and past the point where a scrolling reader has moved on.
      at(150, () => setPhase(1)); // your message arrives (green, right)
      at(800, () => setPhase(3)); // the Seam — what they typed and never sent
      at(1600, () => setPhase(6)); // the bland reply they sent instead
      at(2200, () => setPhase(7)); // the consequence
      return () => timers.forEach(clearTimeout);
    }
    at(150, () => setPhase(1)); // their message arrives
    at(850, () => setPhase(2)); // your live bubble appears + typing starts
    at(2250, () => setPhase(3)); // …you hesitate (thought cloud)
    at(2850, () => setPhase(4)); // …strike it through
    at(3300, () => setPhase(5)); // …collapse into "You deleted this message"
    at(3650, () => setPhase(6)); // the bland reply you sent instead
    at(4050, () => setPhase(7)); // the consequence
    return () => timers.forEach(clearTimeout);
  }, [inView, reduce, honest, variant]);

  // Type the honest message char-by-char once the live bubble is up (presi: 1.25s).
  // "you-withheld" only — "they-withheld" never types the honest message in-chat.
  useEffect(() => {
    if (reduce || phase !== 2 || variant !== "you-withheld") return;
    const controls = animate(0, honest.length, {
      duration: 1.25,
      ease: "linear",
      onUpdate: (v) => setTyped(honest.slice(0, Math.round(v))),
    });
    return () => controls.stop();
  }, [phase, reduce, honest, variant]);

  const fade = (show: boolean, dur = 0.4) => ({
    initial: { opacity: 0, y: 10 } as const,
    animate: { opacity: show ? 1 : 0, y: show ? 0 : 10 },
    transition: { duration: dur, ease: "easeOut" as const },
  });
  const collapsed = phase >= 5; // "you-withheld": bubble shows the "deleted" state

  return (
    <MotionConfig reducedMotion="user">
      <div ref={ref} className="container mx-auto max-w-xl">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <SectionHeader title={heading} />
        </motion.div>
        <div className="mx-auto max-w-md rounded-2xl border border-border shadow-sm overflow-hidden">
          {/* Chat header — the contact you're messaging */}
          <div className="flex items-center gap-3 bg-card px-4 py-3 border-b border-border">
            <img src={avatarSrc} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">{contact}</p>
              <p className="text-[11px] text-muted-foreground leading-tight">{subtitle}</p>
            </div>
          </div>
          {/* Chat body — wallpaper; the beat plays out top-to-bottom */}
          <div className="bg-[#efeae2] px-3 py-4 space-y-2">
            {variant === "you-withheld" ? (
              <>
                {/* Them — received, left, white */}
                <motion.div className="flex justify-start" {...fade(phase >= 1)}>
                  <div className="max-w-[80%] rounded-lg rounded-tl-sm bg-white shadow-sm px-3 py-2 text-sm text-[#111b21]">
                    {received}
                    <span className="block text-right text-[10px] text-[#54656f] mt-0.5">12:02</span>
                  </div>
                </motion.div>
                {/* You — typed live, then struck through and collapsed into "deleted" */}
                <motion.div className="flex justify-end" {...fade(phase >= 2)}>
                  <div className="max-w-[80%] rounded-lg rounded-tr-sm bg-[#d9fdd3] shadow-sm px-3 py-2">
                    {collapsed ? (
                      <>
                        <p className="flex items-center gap-1.5 text-sm italic text-[#54656f]">
                          <BanIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> You deleted this message
                        </p>
                        <p className="mt-1.5 border-t border-[#54656f]/15 pt-1.5 text-[13px] italic text-[#3b4a54] leading-snug">
                          {honest}
                        </p>
                        <span className="block text-right text-[10px] text-[#54656f] mt-0.5">12:03</span>
                      </>
                    ) : (
                      <p className="text-sm text-[#111b21] leading-snug min-h-[1.25rem]">
                        <span className={phase >= 4 ? "line-through decoration-[#ef4444]" : ""}>{typed}</span>
                        {phase === 2 && <span className="ml-px inline-block w-[1px] animate-pulse text-[#54656f]">▍</span>}
                      </p>
                    )}
                  </div>
                </motion.div>
                {/* You — what you sent instead (right, green) */}
                <motion.div className="flex justify-end" {...fade(phase >= 6)}>
                  <div className="max-w-[80%] rounded-lg rounded-tr-sm bg-[#d9fdd3] shadow-sm px-3 py-2 text-sm text-[#111b21]">
                    {sent}
                    <span className="block text-right text-[10px] text-[#54656f] mt-0.5">12:04 <span className="text-blue-500">✓✓</span></span>
                  </div>
                </motion.div>
              </>
            ) : (
              <>
                {/* You — what you sent them (right, green) */}
                <motion.div className="flex justify-end" {...fade(phase >= 1)}>
                  <div className="max-w-[80%] rounded-lg rounded-tr-sm bg-[#d9fdd3] shadow-sm px-3 py-2 text-sm text-[#111b21]">
                    {received}
                    <span className="block text-right text-[10px] text-[#54656f] mt-0.5">12:02 <span className="text-blue-500">✓✓</span></span>
                  </div>
                </motion.div>
                {/* THE SEAM — the honest reply that was typed and never sent. WhatsApp
                    can't show a message that was never sent, so this breaks OUT of the
                    chat wallpaper entirely: bg-muted (distinct from both the #efeae2
                    wallpaper AND the white received/sent bubbles — bg-background alone
                    is pure white and reads as an oversized bubble instead of a break),
                    hairline borders, no bubble/tail/timestamp/shadow — it must not look
                    like a message. It fades in once (never back out) so it stays fully
                    visible and legible at rest, including for reduced-motion users who
                    land directly on phase 7 — the prior "typing…" tell faded to opacity 0
                    while still occupying layout height, and never appeared at all under
                    reduced motion. This is the payload of the beat; it must not vanish. */}
                <motion.div className="-mx-3 border-y border-border bg-muted px-3 py-3" {...fade(phase >= 3, 0.5)}>
                  <p className="text-[10px] uppercase tracking-wider text-foreground/70">
                    {`ON ${contact.toUpperCase()}'S PHONE · 12:03 · TYPED, NEVER SENT`}
                  </p>
                  <p className="mt-1.5 text-[15px] text-foreground leading-snug">
                    {honest}
                  </p>
                </motion.div>
                {/* Them — the bland reply that actually arrives (left, white) */}
                <motion.div className="flex justify-start" {...fade(phase >= 6)}>
                  <div className="max-w-[80%] rounded-lg rounded-tl-sm bg-white shadow-sm px-3 py-2 text-sm text-[#111b21]">
                    {sent}
                    <span className="block text-right text-[10px] text-[#54656f] mt-0.5">12:04</span>
                  </div>
                </motion.div>
              </>
            )}
            {/* Consequence — presi "soft danger" wash (light red, deep-red ink). bg + border
                set inline: cp's preflight `* { border-color }` out-cascades a border utility,
                so the red border only lands reliably via inline style (scoped to this mockup). */}
            <motion.div className="flex justify-center pt-1" {...fade(phase >= 7, 0.45)}>
              <span
                className="rounded-md border px-3 py-1 text-center text-[11px] font-semibold text-[#b42318] shadow-sm"
                style={{ backgroundColor: "rgba(239,68,68,0.07)", borderColor: "rgba(239,68,68,0.16)" }}
              >
                {consequence}
              </span>
            </motion.div>
          </div>
        </div>
        {/* Private thought OUTSIDE the chat — appears during the hesitate beat (phase 3). */}
        <motion.div
          className="relative mx-auto max-w-md mt-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : 16 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          {/* thought-cloud tail — small circles rising toward the unsent message.
              "you-withheld": the unsent message is on the right (you). "they-withheld":
              the honest reply now lives in The Seam, on the left (the counterpart). */}
          <div className={`absolute -top-4 flex flex-col items-center gap-1 ${variant === "they-withheld" ? "left-10" : "right-10"}`}>
            <span className="block w-3.5 h-3.5 rounded-full border border-border bg-background"></span>
            <span className="block w-2 h-2 rounded-full border border-border bg-background"></span>
          </div>
          <div className="rounded-[28px] border border-border bg-muted/40 px-5 py-4 shadow-sm">
            <p className="flex items-center gap-1.5 text-sm font-bold text-foreground mb-1.5">
              <BrainIcon className="w-4 h-4 shrink-0" aria-hidden="true" /> {thoughtTitle}
            </p>
            <p className="text-sm italic text-foreground/80 leading-snug">
              {thoughtBody}
            </p>
          </div>
        </motion.div>
      </div>
    </MotionConfig>
  );
}
