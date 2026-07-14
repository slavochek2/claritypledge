/**
 * Hard-truth chat — shared WhatsApp-style "the honest message that stayed unsent"
 * mockup (presi chat-timeline port). The honest message is TYPED into a live bubble,
 * then hesitated over, struck through (red), and collapsed into "You deleted this
 * message" — the motion IS the point: the truth was hard to say, so it stayed unsent.
 * Reduced-motion users get the final (deleted) state, no animation.
 *
 * Used on / (key-hire scenario, P987) and /coach (customer refund scenario); all
 * content is passed via props. NOTE: green/beige hex are WhatsApp brand colors; the
 * red consequence wash + strike mirror presi's "soft danger" treatment — scoped here.
 *
 * Self-wraps in MotionConfig reducedMotion="user" so reduced-motion behavior is identical
 * wherever it's mounted (the coach page has no page-level MotionConfig).
 */
import { useState, useRef, useEffect, type ReactNode } from "react";
import { BanIcon, BrainIcon } from "lucide-react";
import { motion, useInView, useReducedMotion, animate, MotionConfig } from "framer-motion";
import { SectionHeader } from "@/app/components/landing/section-header";

export interface HardTruthChatProps {
  /** Section heading above the chat. Defaults to the original /coach + /program
   *  heading — pass a scenario-specific heading to override without affecting
   *  other callers (P987: /program went observational, /coach kept the default). */
  heading?: ReactNode;
  /** Contact name in the chat header — who you're messaging. */
  contact: string;
  /** The message they sent you (received, left, white bubble). */
  received: string;
  /** The honest reply you TYPE then delete (typed char-by-char, struck, then collapsed). */
  honest: string;
  /** The bland reply you sent instead (right, green bubble). */
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
  heading = <>When the hard truth is <span className="text-blue-500">difficult to say</span></>,
  contact,
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
    at(150, () => setPhase(1)); // their message arrives
    at(850, () => setPhase(2)); // your live bubble appears + typing starts
    at(2250, () => setPhase(3)); // …you hesitate (thought cloud)
    at(2850, () => setPhase(4)); // …strike it through
    at(3300, () => setPhase(5)); // …collapse into "You deleted this message"
    at(3650, () => setPhase(6)); // the bland reply you sent instead
    at(4050, () => setPhase(7)); // the consequence
    return () => timers.forEach(clearTimeout);
  }, [inView, reduce, honest]);

  // Type the honest message char-by-char once the live bubble is up (presi: 1.25s).
  useEffect(() => {
    if (reduce || phase !== 2) return;
    const controls = animate(0, honest.length, {
      duration: 1.25,
      ease: "linear",
      onUpdate: (v) => setTyped(honest.slice(0, Math.round(v))),
    });
    return () => controls.stop();
  }, [phase, reduce, honest]);

  const fade = (show: boolean, dur = 0.4) => ({
    initial: { opacity: 0, y: 10 } as const,
    animate: { opacity: show ? 1 : 0, y: show ? 0 : 10 },
    transition: { duration: dur, ease: "easeOut" as const },
  });
  const collapsed = phase >= 5; // bubble shows the "deleted" state

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
              <p className="text-[11px] text-muted-foreground leading-tight">last seen recently</p>
            </div>
          </div>
          {/* Chat body — wallpaper; the beat plays out top-to-bottom */}
          <div className="bg-[#efeae2] px-3 py-4 space-y-2">
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
          {/* thought-cloud tail — small circles rising toward the unsent message (right) */}
          <div className="absolute -top-4 right-10 flex flex-col items-center gap-1">
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
