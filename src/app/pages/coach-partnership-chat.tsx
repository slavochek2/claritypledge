/**
 * /coach's own chat beat, "When the hard truth is difficult to say" (P915), kept page-local and
 * restyled in place by P1674 (D5): the coach drafts the honest reply, deletes it, and loses the
 * customer. The shared HardTruthChat is a different scene. The page renders the heading.
 */
import { useEffect, useRef, useState } from "react";
import { BanIcon } from "lucide-react";

// The honest draft the coach typed, then binned. Single source — typed live,
// then shown as the deleted-message preview.
const HONEST_DRAFT = "\"Honestly, I think 1-on-1 would fix this — want to switch instead of a refund?\"";

/**
 * "When the hard truth is difficult to say" — the talk-deck chat beat, ported to
 * the landing. On scroll-in it replays: the customer asks for a refund → the
 * coach drafts the honest reply → hesitates (thought-cloud) → strikes it →
 * it collapses to "You deleted this message" → the bland reply sends → the
 * customer is lost. Realism kept (WhatsApp green/beige, refined tones).
 *
 * EVERY asserted string is always in the DOM; only opacity/transform/maxHeight
 * are gated by phase. So when the observer never fires (jsdom test) or motion is
 * reduced, the full final state is present and legible — no conditional render.
 */
export function CoachHardTruthChat() {
  const ref = useRef<HTMLDivElement>(null);
  const FINAL = 7;
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      setPhase(FINAL);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const ob = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        ob.disconnect();
        // customer · draft · hesitate · strike · collapse · reply · consequence
        [200, 900, 1800, 2600, 3100, 3700, 4300].forEach((t, i) => {
          timers.push(setTimeout(() => setPhase(i + 1), t));
        });
      },
      { threshold: 0.4 },
    );
    ob.observe(el);
    return () => {
      ob.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  // opacity + rise, gated on reaching phase p
  const rise = (p: number) => ({
    opacity: phase >= p ? 1 : 0,
    transform: phase >= p ? "none" : "translateY(10px)",
    transition: "opacity .5s ease-out, transform .5s ease-out",
  });
  const deleted = phase >= 5; // collapsed to "You deleted this message"

  return (
    <div ref={ref}>
      <div className="mx-auto max-w-md rounded-2xl border border-border shadow-sm overflow-hidden">
        {/* Chat header — the contact you're messaging (the customer) */}
        <div className="flex items-center gap-3 bg-card px-4 py-3 border-b border-border">
          <img
            src="/customer-avatar.jpg"
            alt="Your Customer"
            className="w-9 h-9 rounded-full object-cover shrink-0"
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Your Customer</p>
            <p className="text-[11px] text-muted-foreground leading-tight">last seen recently</p>
          </div>
        </div>
        {/* Chat body — wallpaper (WhatsApp light, warmer tone) */}
        <div className="bg-[#ebe4dc] px-3 py-4 space-y-2">
          {/* Customer — received, left, white */}
          <div className="flex justify-start" style={rise(1)}>
            <div className="max-w-[80%] rounded-lg rounded-tl-sm bg-white shadow-sm px-3 py-2 text-sm text-[#111b21]">
              I want a refund. This isn't working for me.
              <span className="block text-right text-[10px] text-[#54656f] mt-0.5">12:02</span>
            </div>
          </div>
          {/* You — the honest draft: typed live, hesitated over, then deleted */}
          <div className="flex justify-end" style={rise(2)}>
            <div className="max-w-[80%] rounded-lg rounded-tr-sm bg-[#dcf8c6] shadow-sm px-3 py-2">
              {/* "You deleted this message" header — collapses in on delete */}
              <div
                style={{
                  maxHeight: deleted ? "2.5rem" : 0,
                  opacity: deleted ? 1 : 0,
                  overflow: "hidden",
                  transition: "max-height .4s ease, opacity .3s ease",
                }}
              >
                <p className="flex items-center gap-1.5 text-sm italic text-[#54656f] border-b border-[#54656f]/15 pb-1.5 mb-1.5">
                  <BanIcon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> You deleted this message
                </p>
              </div>
              <p
                className={`leading-snug ${deleted ? "text-[13px] italic text-[#3b4a54]" : "text-sm text-[#111b21]"} ${phase === 4 ? "line-through" : ""}`}
                style={{ transition: "color .3s ease" }}
              >
                {HONEST_DRAFT}
              </p>
              <span className="block text-right text-[10px] text-[#54656f] mt-0.5">12:03</span>
            </div>
          </div>
          {/* You — what you sent instead (right, green) */}
          <div className="flex justify-end" style={rise(6)}>
            <div className="max-w-[80%] rounded-lg rounded-tr-sm bg-[#dcf8c6] shadow-sm px-3 py-2 text-sm text-[#111b21]">
              Of course. I'll process your refund today.
              <span className="block text-right text-[10px] text-[#54656f] mt-0.5">12:04 <span className="text-blue-500">✓✓</span></span>
            </div>
          </div>
          {/* System status — WhatsApp-style centered pill (the outcome) */}
          <div className="flex justify-center pt-1" style={rise(7)}>
            <span className="rounded-md border !border-[rgba(239,68,68,0.16)] bg-[rgba(239,68,68,0.07)] px-3 py-1 text-[11px] font-semibold text-[#b42318] shadow-sm">
              Customer lost · refund initiated
            </span>
          </div>
        </div>
      </div>
      {/* Private thought OUTSIDE the chat — why the honest alternative stayed unsent */}
      <div className="relative mx-auto max-w-md mt-6" style={rise(3)}>
        {/* thought-cloud tail — small circles rising toward the unsent message (right) */}
        <div className="absolute -top-4 right-10 flex flex-col items-center gap-1">
          <span className="block w-3.5 h-3.5 rounded-full border border-border bg-background"></span>
          <span className="block w-2 h-2 rounded-full border border-border bg-background"></span>
        </div>
        <div className="rounded-[28px] border border-border bg-muted/40 px-5 py-4 shadow-sm">
          <p className="text-sm font-bold text-foreground mb-1.5">
            Why couldn't the coach just be honest?
          </p>
          <p className="text-sm italic text-foreground/80 leading-snug">
            "She'd misunderstand it as avoiding the refund."
          </p>
        </div>
      </div>
    </div>
  );
}
