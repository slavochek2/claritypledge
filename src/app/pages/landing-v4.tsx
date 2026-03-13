/**
 * Landing V4 — "Step Through Clarity"
 *
 * Card-by-card forward-navigation landing. No scroll.
 * Aesthetic: crystalline clarity — ethereal editorial on light theme.
 * Instrument Serif display, grain texture, radial glows, blur-dissolve transitions.
 *
 * Real components: PointCardWithLinks, StoryCardWithLinks, DualCTA
 * Prototype: /tree/landing-v4
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PointCardWithLinks } from "@/app/components/social/point-card-with-links";
import { StoryCardWithLinks } from "@/app/components/social/story-card-with-links";
import { DualCTA } from "@/app/components/landing/dual-cta";
import type { Point, Story, PositionType } from "@/app/prototypes/shared/types";
import type { SevenPointCounts } from "@/app/prototypes/linkedin-like/components/shared";
import type { StoryAuthor } from "@/app/components/social/story-card-with-links";

// ─── SERIF UTILITY ───────────────────────────────────────────────
const SERIF = "'Instrument Serif', Georgia, serif";

// ─── MOCK DATA ───────────────────────────────────────────────────
const MOCK_POINT: Point = {
  id: "landing-point-1",
  text: "Co-founders overestimate how well they understand each other.",
  createdAt: "2026-01-15T10:00:00Z",
  positions: {
    "user-a": { position: "agree", timestamp: "2026-01-15T10:01:00Z" },
    "user-b": { position: "strongly_agree", timestamp: "2026-01-16T09:00:00Z" },
    "user-c": { position: "disagree", timestamp: "2026-01-17T14:00:00Z" },
  },
  linkedStoryIds: ["landing-story-1"],
};

const MOCK_COUNTS: SevenPointCounts = {
  strongly_disagree: 0,
  disagree: 1,
  somewhat_disagree: 0,
  unsure: 0,
  somewhat_agree: 0,
  agree: 1,
  strongly_agree: 1,
};

const MOCK_STORY: Story = {
  id: "landing-story-1",
  text: "We agreed to focus on enterprise. Six months later I discovered my co-founder had been pitching SMBs the whole time. We used the same word — 'focus' — and meant opposite things.\n\nThat's a false agreement. It looked like alignment. It cost us six months and the trust we'd built.",
  authorId: "founder-slava",
  createdAt: "2026-01-10T08:00:00Z",
  visibility: "public",
  linkedPointIds: ["landing-point-1"],
  understoodCount: 3,
};

const MOCK_STORY_AUTHOR: StoryAuthor = {
  id: "founder-slava",
  name: "Anonymous Founder",
  role: "14 co-founder relationships",
  hasPledged: true,
  ear: 3,
  avatarColor: "#3b82f6",
};

// ─── FONT LOADER ─────────────────────────────────────────────────
function useFontLoader() {
  useEffect(() => {
    const link = document.createElement("link");
    link.href =
      "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);
}

// ─── GRAIN OVERLAY ───────────────────────────────────────────────
function GrainOverlay() {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-50"
      style={{
        opacity: 0.025,
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      }}
    />
  );
}

// ─── AMBIENT GLOW ────────────────────────────────────────────────
function AmbientGlow() {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-[1]"
      style={{
        background:
          "radial-gradient(ellipse at 50% 35%, rgba(59,130,246,0.045) 0%, transparent 65%)",
      }}
    />
  );
}

// ─── CONSTELLATION (enhanced) ────────────────────────────────────
function ConstellationLight() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const N = 55;
    const colors = [
      [59, 130, 246], // blue
      [99, 102, 241], // indigo
      [139, 92, 246], // violet
      [59, 130, 246], // blue again (dominant)
    ];
    const particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      a: number;
      color: number[];
    }[] = [];

    function resize() {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }
    resize();
    window.addEventListener("resize", resize);

    const w = () => canvas.offsetWidth;
    const h = () => canvas.offsetHeight;

    for (let i = 0; i < N; i++) {
      particles.push({
        x: Math.random() * 2000,
        y: Math.random() * 1200,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: Math.random() * 2 + 0.5,
        a: Math.random() * 0.18 + 0.04,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    function draw() {
      const cw = w();
      const ch = h();
      ctx.clearRect(0, 0, cw, ch);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = cw;
        if (p.x > cw) p.x = 0;
        if (p.y < 0) p.y = ch;
        if (p.y > ch) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color[0]},${p.color[1]},${p.color[2]},${p.a})`;
        ctx.fill();
      });

      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 140) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(99,102,241,${0.05 * (1 - d / 140)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(draw);
    }
    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
    />
  );
}

// ─── EXHIBIT FRAME — theatrical card staging ────────────────────
function ExhibitFrame({
  children,
  color = "59,130,246",
  intensity = 0.06,
  annotation,
}: {
  children: React.ReactNode;
  color?: string;
  intensity?: number;
  annotation?: string;
}) {
  return (
    <div className="relative py-3">
      {/* Radial glow behind card */}
      <div
        className="absolute -inset-8 rounded-3xl"
        style={{
          background: `radial-gradient(ellipse at center, rgba(${color},${intensity}), transparent 70%)`,
        }}
      />

      {/* Decorative corner marks — museum specimen brackets */}
      <div className="absolute -top-1.5 -left-3 w-5 h-5 border-t border-l border-blue-300/20 rounded-tl-sm" />
      <div className="absolute -top-1.5 -right-3 w-5 h-5 border-t border-r border-blue-300/20 rounded-tr-sm" />
      <div className="absolute -bottom-1.5 -left-3 w-5 h-5 border-b border-l border-blue-300/20 rounded-bl-sm" />
      <div className="absolute -bottom-1.5 -right-3 w-5 h-5 border-b border-r border-blue-300/20 rounded-br-sm" />

      {/* Floating vertical annotation */}
      {annotation && (
        <div className="absolute top-1/2 -translate-y-1/2 -right-10 hidden sm:block">
          <p
            className="text-[9px] font-mono tracking-[3px] uppercase text-blue-300/25"
            style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
          >
            {annotation}
          </p>
        </div>
      )}

      {/* Subtle lift shadow for depth */}
      <div
        className="relative"
        style={{ filter: "drop-shadow(0 8px 32px rgba(59,130,246,0.04))" }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── MONO LABEL ──────────────────────────────────────────────────
function MonoLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] tracking-[4px] uppercase text-blue-400/70">
      {children}
    </p>
  );
}

// ─── STEP CONTAINER — crystallize transition ─────────────────────
function StepCard({
  children,
  visible,
  direction = "forward",
}: {
  children: React.ReactNode;
  visible: boolean;
  direction?: "forward" | "back";
}) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center px-6"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible
          ? "translateX(0) scale(1)"
          : direction === "forward"
            ? "translateX(48px) scale(0.97)"
            : "translateX(-48px) scale(0.97)",
        filter: visible ? "blur(0px)" : "blur(8px)",
        pointerEvents: visible ? "auto" : "none",
        transition:
          "opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1), filter 0.7s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}

// ─── STEP 1: POINT ───────────────────────────────────────────────
function StepPoint({
  onPosition,
}: {
  onPosition: (pos: PositionType) => void;
}) {
  const [userPos, setUserPos] = useState<PositionType | null>(null);
  const [fadeIn, setFadeIn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFadeIn(true), 150);
    return () => clearTimeout(t);
  }, []);

  function handlePositionClick(pos: PositionType) {
    setUserPos(pos);
    onPosition(pos);
  }

  return (
    <div className="space-y-6">
      {/* Editorial heading — crystallizes in */}
      <div
        className="text-center space-y-4 transition-all duration-1000"
        style={{
          opacity: fadeIn ? 1 : 0,
          transform: fadeIn ? "translateY(0)" : "translateY(20px)",
        }}
      >
        <MonoLabel>ClarityPledge</MonoLabel>
        <h1
          className="text-4xl sm:text-5xl font-normal text-foreground leading-[1.1] -tracking-[0.02em]"
          style={{ fontFamily: SERIF }}
        >
          Where do
          <br />
          you stand?
        </h1>
        <p className="text-muted-foreground text-sm max-w-xs mx-auto leading-relaxed">
          A falsifiable claim about reality.
          <br />
          Take a position.
        </p>
      </div>

      {/* The Point — exhibited as a specimen */}
      <div
        className="transition-all duration-1000 delay-300"
        style={{
          opacity: fadeIn ? 1 : 0,
          transform: fadeIn
            ? "translateY(0) perspective(800px) rotateX(0deg)"
            : "translateY(20px) perspective(800px) rotateX(2deg)",
        }}
      >
        <ExhibitFrame annotation="live · interactive">
          <PointCardWithLinks
            point={MOCK_POINT}
            linkedStories={[MOCK_STORY]}
            disableNavigation
            liveSessionMode
            selectedPosition={userPos}
            onPositionSelect={handlePositionClick}
            getPointPositionCounts={() => MOCK_COUNTS}
            currentUserId="landing-visitor"
            getStoryAuthor={() => MOCK_STORY_AUTHOR}
          />
        </ExhibitFrame>
      </div>

      {/* Gentle prompt — dissolves when position taken */}
      <div
        className="text-center transition-all duration-700"
        style={{
          opacity: !userPos && fadeIn ? 1 : 0,
          transform: !userPos ? "translateY(0)" : "translateY(-8px)",
          height: !userPos ? "auto" : 0,
        }}
      >
        <div className="flex items-center justify-center gap-3">
          <div className="h-px w-8 bg-gradient-to-r from-transparent to-blue-300/30" />
          <p className="font-mono text-[10px] tracking-[2px] uppercase text-muted-foreground/40">
            Take a position to continue
          </p>
          <div className="h-px w-8 bg-gradient-to-l from-transparent to-blue-300/30" />
        </div>
      </div>
    </div>
  );
}

// ─── STEP 2: VENN ────────────────────────────────────────────────
function StepVenn({
  position,
  onNext,
}: {
  position: PositionType | null;
  onNext: () => void;
}) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 400);
    return () => clearTimeout(t);
  }, []);

  const posLabel =
    position === "agree" ||
    position === "strongly_agree" ||
    position === "somewhat_agree"
      ? "agreed"
      : position === "disagree" ||
          position === "strongly_disagree" ||
          position === "somewhat_disagree"
        ? "disagreed"
        : "weren't sure";

  const posColor =
    posLabel === "agreed"
      ? "text-emerald-600"
      : posLabel === "disagreed"
        ? "text-rose-500"
        : "text-muted-foreground";

  return (
    <div className="space-y-6 text-center">
      <div className="space-y-3">
        <MonoLabel>The overlap</MonoLabel>
        <h2
          className="text-3xl sm:text-4xl font-normal text-foreground leading-[1.15]"
          style={{ fontFamily: SERIF }}
        >
          You <span className={posColor}>{posLabel}</span>.
          <br />
          <span className="text-muted-foreground italic">
            But did your co-founder?
          </span>
        </h2>
      </div>

      {/* Venn diagram — enhanced with gradient fills and glow */}
      <div className="relative h-52 sm:h-60 my-2">
        <svg viewBox="0 0 400 220" className="w-full h-full">
          <defs>
            <radialGradient id="venn-left" cx="40%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(59,130,246,0.12)" />
              <stop offset="100%" stopColor="rgba(59,130,246,0.03)" />
            </radialGradient>
            <radialGradient id="venn-right" cx="60%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(139,92,246,0.12)" />
              <stop offset="100%" stopColor="rgba(139,92,246,0.03)" />
            </radialGradient>
            <radialGradient id="venn-overlap" cx="50%" cy="50%" r="40%">
              <stop offset="0%" stopColor="rgba(239,68,68,0.08)" />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>
          </defs>

          {/* Left circle */}
          <circle
            cx={animated ? 155 : 125}
            cy="110"
            r="85"
            fill="url(#venn-left)"
            stroke="rgba(59,130,246,0.25)"
            strokeWidth="1"
            style={{ transition: "all 1.2s cubic-bezier(0.16,1,0.3,1)" }}
          />
          <text
            x={animated ? 100 : 70}
            y="108"
            textAnchor="middle"
            fontSize="11"
            fill="rgba(59,130,246,0.6)"
            fontFamily="'Inter', sans-serif"
            fontWeight="500"
            letterSpacing="0.05em"
            style={{ transition: "all 1.2s cubic-bezier(0.16,1,0.3,1)" }}
          >
            Your beliefs
          </text>

          {/* Right circle */}
          <circle
            cx={animated ? 245 : 275}
            cy="110"
            r="85"
            fill="url(#venn-right)"
            stroke="rgba(139,92,246,0.25)"
            strokeWidth="1"
            style={{ transition: "all 1.2s cubic-bezier(0.16,1,0.3,1)" }}
          />
          <text
            x={animated ? 300 : 330}
            y="108"
            textAnchor="middle"
            fontSize="11"
            fill="rgba(139,92,246,0.6)"
            fontFamily="'Inter', sans-serif"
            fontWeight="500"
            letterSpacing="0.05em"
            style={{ transition: "all 1.2s cubic-bezier(0.16,1,0.3,1)" }}
          >
            Their beliefs
          </text>

          {/* Overlap glow */}
          {animated && (
            <circle cx="200" cy="110" r="45" fill="url(#venn-overlap)">
              <animate
                attributeName="r"
                values="42;48;42"
                dur="4s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0.6;1;0.6"
                dur="4s"
                repeatCount="indefinite"
              />
            </circle>
          )}

          {/* Center text */}
          <text
            x="200"
            y="104"
            textAnchor="middle"
            fontSize="10"
            fill="hsl(var(--foreground))"
            fontWeight="500"
            fontFamily="'Inter', sans-serif"
            opacity={animated ? 1 : 0}
            style={{ transition: "opacity 0.8s 0.6s" }}
          >
            Shared understanding
          </text>
          <text
            x="200"
            y="120"
            textAnchor="middle"
            fontSize="10"
            fill="hsl(var(--muted-foreground))"
            fontFamily="'Inter', sans-serif"
            fontStyle="italic"
            opacity={animated ? 1 : 0}
            style={{ transition: "opacity 0.8s 0.9s" }}
          >
            or comfortable delusion?
          </text>

          {/* Pulsing question mark */}
          <text
            x="200"
            y="152"
            textAnchor="middle"
            fontSize="22"
            fill="rgba(239,68,68,0.5)"
            fontFamily={SERIF}
            fontStyle="italic"
            opacity={animated ? 1 : 0}
            style={{ transition: "opacity 1s 1.2s" }}
          >
            ?
          </text>
        </svg>
      </div>

      <p
        className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed"
        style={{ fontFamily: "'Inter', sans-serif" }}
      >
        Without verification, the overlap is a mix of{" "}
        <span className="text-foreground font-medium">real understanding</span>{" "}
        and{" "}
        <span className="text-rose-500/80 font-medium">
          shared false beliefs
        </span>
        .
      </p>

      <Button
        onClick={onNext}
        variant="outline"
        className="gap-2 rounded-full border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300 px-6"
      >
        How do you tell them apart?
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ─── STEP 3: QUADRANT (Force-field style) ────────────────────────
function StepQuadrant({ onNext }: { onNext: () => void }) {
  const [reveal, setReveal] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReveal(true), 300);
    return () => clearTimeout(t);
  }, []);

  const states = [
    {
      label: "False Agreement",
      desc: "Both think they agree. Neither checked.",
      badge: "dangerous",
      glowColor: "239,68,68",
      borderColor: "border-rose-200/60",
      badgeColor: "text-rose-500 bg-rose-50",
      textColor: "text-rose-700",
    },
    {
      label: "False Disagreement",
      desc: "Positions seem opposed. It's a misunderstanding.",
      badge: "wasteful",
      glowColor: "245,158,11",
      borderColor: "border-amber-200/60",
      badgeColor: "text-amber-600 bg-amber-50",
      textColor: "text-amber-700",
    },
    {
      label: "True Disagreement",
      desc: "You disagree AND understand each other.",
      badge: "honest",
      glowColor: "139,92,246",
      borderColor: "border-violet-200/60",
      badgeColor: "text-violet-500 bg-violet-50",
      textColor: "text-violet-700",
    },
    {
      label: "True Agreement",
      desc: "You agree AND mean the same thing. Verified.",
      badge: "confirmed",
      glowColor: "16,185,129",
      borderColor: "border-emerald-200/60",
      badgeColor: "text-emerald-600 bg-emerald-50",
      textColor: "text-emerald-700",
    },
  ];

  return (
    <div className="space-y-7 text-center">
      <div className="space-y-3">
        <MonoLabel>Four states of agreement</MonoLabel>
        <h2
          className="text-3xl sm:text-4xl font-normal text-foreground"
          style={{ fontFamily: SERIF }}
        >
          Only two are{" "}
          <em className="not-italic text-emerald-600">real</em>.
        </h2>
        <p className="text-sm text-muted-foreground">
          ClarityPledge detects the false ones.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {states.map((s, i) => (
          <div
            key={s.label}
            className={`group relative rounded-xl border p-4 text-left overflow-hidden transition-all duration-600 cursor-default ${s.borderColor}`}
            style={{
              opacity: reveal ? 1 : 0,
              transform: reveal ? "translateY(0)" : "translateY(16px)",
              transition: `all 0.6s cubic-bezier(0.16,1,0.3,1) ${i * 100}ms`,
            }}
          >
            {/* Hover glow */}
            <div
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              style={{
                background: `radial-gradient(ellipse at center, rgba(${s.glowColor},0.06), transparent 70%)`,
              }}
            />
            <div className="relative">
              <span
                className={`inline-block font-mono text-[9px] tracking-[2px] uppercase px-2 py-0.5 rounded-full ${s.badgeColor}`}
              >
                {s.badge}
              </span>
              <h3
                className={`text-sm font-semibold mt-2.5 ${s.textColor}`}
              >
                {s.label}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {s.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      <Button
        onClick={onNext}
        variant="outline"
        className="gap-2 rounded-full border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300 px-6"
      >
        See a real story
        <ArrowRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// ─── STEP 4: STORY ───────────────────────────────────────────────
function StepStory({ onNext }: { onNext: () => void }) {
  const [fadeIn, setFadeIn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFadeIn(true), 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-5">
      {/* Literary heading */}
      <div
        className="text-center space-y-3 transition-all duration-1000"
        style={{
          opacity: fadeIn ? 1 : 0,
          transform: fadeIn ? "translateY(0)" : "translateY(16px)",
        }}
      >
        <MonoLabel>The why behind positions</MonoLabel>
        <h2
          className="text-3xl sm:text-4xl font-normal text-foreground leading-[1.15]"
          style={{ fontFamily: SERIF }}
        >
          Every position
          <br />
          has a <em>story</em>.
        </h2>
      </div>

      {/* Story as a manuscript exhibit — pull-quote → card → attribution */}
      <div
        className="space-y-3 transition-all duration-1000 delay-200"
        style={{
          opacity: fadeIn ? 1 : 0,
          transform: fadeIn
            ? "translateY(0) perspective(800px) rotateX(0deg)"
            : "translateY(16px) perspective(800px) rotateX(1.5deg)",
        }}
      >
        {/* Pull-quote teaser — editorial framing */}
        <div className="flex items-start gap-3 px-1">
          <div className="w-0.5 h-8 bg-gradient-to-b from-violet-400/40 to-transparent rounded-full mt-0.5 shrink-0" />
          <p
            className="text-sm text-muted-foreground/70 leading-relaxed italic"
            style={{ fontFamily: SERIF }}
          >
            "We used the same word and meant opposite things."
          </p>
        </div>

        {/* The exhibited card */}
        <ExhibitFrame color="139,92,246" intensity={0.05} annotation="real story">
          <StoryCardWithLinks
            story={MOCK_STORY}
            author={MOCK_STORY_AUTHOR}
            linkedPoints={[MOCK_POINT]}
            disableNavigation
            hideActions
            context="story-detail"
            getPointPositionCounts={() => MOCK_COUNTS}
          />
        </ExhibitFrame>

        {/* Post-card editorial note */}
        <p className="text-center text-xs text-muted-foreground/50 leading-relaxed">
          Lived experience that data alone can't capture.
        </p>
      </div>

      <div
        className="text-center transition-all duration-1000 delay-400"
        style={{ opacity: fadeIn ? 1 : 0 }}
      >
        <Button
          onClick={onNext}
          variant="outline"
          className="gap-2 rounded-full border-violet-200 text-violet-600 hover:bg-violet-50 hover:border-violet-300 px-6"
        >
          Can you explain it back?
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ─── STEP 5: EXPLAIN-BACK ────────────────────────────────────────
function StepExplainBack({ onNext }: { onNext: () => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [fadeIn, setFadeIn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFadeIn(true), 150);
    return () => clearTimeout(t);
  }, []);

  const options = [
    {
      text: "They want to pivot completely to a new market.",
      score: 25,
      label: "wrong" as const,
    },
    {
      text: "They're worried about GTM velocity, not the product itself — and want to explore repositioning before we burn runway.",
      score: 88,
      label: "correct" as const,
    },
    {
      text: "They think we need to hire more salespeople.",
      score: 30,
      label: "wrong" as const,
    },
  ];

  const revealColors = {
    correct:
      "border-emerald-300 bg-emerald-50/50 text-emerald-800",
    wrong: "border-rose-200/50 bg-rose-50/30 text-muted-foreground",
  };

  return (
    <div className="space-y-6 text-center">
      <div
        className="space-y-3 transition-all duration-1000"
        style={{
          opacity: fadeIn ? 1 : 0,
          transform: fadeIn ? "translateY(0)" : "translateY(16px)",
        }}
      >
        <MonoLabel>The explain-back test</MonoLabel>
        <h2
          className="text-3xl sm:text-4xl font-normal text-foreground leading-[1.15]"
          style={{ fontFamily: SERIF }}
        >
          Prove you
          <br />
          <em>understood</em>.
        </h2>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          Not what <em>you</em> think. What <em>they</em> meant.
        </p>
      </div>

      {/* Editorial quote */}
      <div
        className="text-left border-l-2 border-blue-300/50 pl-5 py-1 transition-all duration-1000 delay-200"
        style={{
          opacity: fadeIn ? 1 : 0,
          transform: fadeIn ? "translateY(0)" : "translateY(12px)",
        }}
      >
        <p className="text-[11px] font-mono tracking-[2px] uppercase text-blue-400/60 mb-2">
          Your co-founder said
        </p>
        <p
          className="text-base sm:text-lg text-foreground leading-relaxed"
          style={{ fontFamily: SERIF, fontStyle: "italic" }}
        >
          "I think we need to rethink our approach to getting customers. What
          we're doing isn't scaling and I'm worried we'll burn through runway."
        </p>
      </div>

      <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
        Select the best paraphrase
      </p>

      <div
        className="space-y-2.5 text-left transition-all duration-1000 delay-300"
        style={{
          opacity: fadeIn ? 1 : 0,
          transform: fadeIn ? "translateY(0)" : "translateY(8px)",
        }}
      >
        {options.map((opt, i) => (
          <button
            key={i}
            disabled={selected !== null}
            onClick={() => setSelected(i)}
            className={`group w-full p-3.5 rounded-xl border text-sm text-left transition-all duration-500 leading-relaxed flex items-start gap-3 ${
              selected !== null
                ? revealColors[opt.label]
                : "border-border/60 bg-white/60 hover:bg-white hover:border-border hover:shadow-sm text-foreground"
            }`}
          >
            <span
              className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono mt-0.5 transition-all duration-300 ${
                selected !== null
                  ? opt.label === "correct"
                    ? "bg-emerald-100 text-emerald-600"
                    : "bg-rose-50 text-rose-300"
                  : "bg-muted/50 text-muted-foreground/50 group-hover:bg-blue-50 group-hover:text-blue-500"
              }`}
            >
              {String.fromCharCode(97 + i)}
            </span>
            <span>{opt.text}</span>
          </button>
        ))}
      </div>

      {selected !== null && (
        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {/* Score reveal — theatrical moment */}
          <div className="relative">
            {/* Glow behind score */}
            <div
              className="absolute inset-0 -inset-y-8"
              style={{
                background: `radial-gradient(ellipse at 50% 50%, ${
                  options[selected].label === "correct"
                    ? "rgba(16,185,129,0.06)"
                    : "rgba(239,68,68,0.05)"
                }, transparent 70%)`,
              }}
            />
            <div className="relative bg-white/60 backdrop-blur-sm border border-border/30 rounded-xl p-6">
              <p className="font-mono text-[9px] tracking-[3px] uppercase text-muted-foreground/50 mb-3">
                Comprehension accuracy
              </p>
              <p
                className={`text-5xl sm:text-6xl font-light tracking-tight ${
                  options[selected].label === "correct"
                    ? "text-emerald-600"
                    : "text-rose-400"
                }`}
                style={{ fontFamily: SERIF }}
              >
                {options[selected].score}
                <span className="text-2xl text-muted-foreground/40">%</span>
              </p>
              <div className="mt-3 h-px w-12 mx-auto bg-gradient-to-r from-transparent via-border/50 to-transparent" />
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed max-w-xs mx-auto">
                {options[selected].label === "correct"
                  ? "You captured the reasoning, not just the words. This is calibrated understanding."
                  : "You jumped to conclusions the speaker never stated. This is how false agreements form."}
              </p>
            </div>
          </div>

          <Button
            onClick={onNext}
            className="gap-2 rounded-full px-6 bg-foreground text-background hover:bg-foreground/90"
          >
            Get started
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── STEP 6: CTA ─────────────────────────────────────────────────
function StepCTA() {
  const [fadeIn, setFadeIn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFadeIn(true), 150);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="space-y-8 text-center">
      {/* Radial glow behind headline */}
      <div className="relative">
        <div
          className="absolute inset-0 -top-20 -bottom-20"
          style={{
            background:
              "radial-gradient(ellipse at 50% 50%, rgba(59,130,246,0.06) 0%, transparent 60%)",
          }}
        />
        <div
          className="relative space-y-4 transition-all duration-1000"
          style={{
            opacity: fadeIn ? 1 : 0,
            transform: fadeIn ? "translateY(0)" : "translateY(24px)",
          }}
        >
          <h2
            className="text-4xl sm:text-5xl font-normal text-foreground leading-[1.1]"
            style={{ fontFamily: SERIF }}
          >
            Stop assuming.
            <br />
            <span className="text-blue-500">Test it.</span>
          </h2>
          <p className="text-muted-foreground max-w-sm mx-auto leading-relaxed text-sm">
            The conversation you need to have
            <br />
            is the one you think you already had.
          </p>
        </div>
      </div>

      <div
        className="transition-all duration-1000 delay-300"
        style={{
          opacity: fadeIn ? 1 : 0,
          transform: fadeIn ? "translateY(0)" : "translateY(12px)",
        }}
      >
        <DualCTA size="section" />
      </div>

      <div
        className="flex gap-5 justify-center text-xs text-muted-foreground/60 pt-2 transition-all duration-1000 delay-500"
        style={{ opacity: fadeIn ? 1 : 0 }}
      >
        <a
          href="/feed"
          className="hover:text-foreground transition-colors duration-300"
        >
          Explore
        </a>
        <span className="text-border">·</span>
        <a
          href="/about"
          className="hover:text-foreground transition-colors duration-300"
        >
          About
        </a>
        <span className="text-border">·</span>
        <a
          href="/events"
          className="hover:text-foreground transition-colors duration-300"
        >
          Workshops
        </a>
      </div>
    </div>
  );
}

// ─── STEP DOTS (refined) ─────────────────────────────────────────
function StepDots({
  total,
  current,
  onDotClick,
}: {
  total: number;
  current: number;
  onDotClick: (step: number) => void;
}) {
  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <button
          key={i}
          onClick={() => (i <= current ? onDotClick(i) : undefined)}
          className="relative p-1"
          aria-label={`Step ${i + 1}`}
        >
          <div
            className={`rounded-full transition-all duration-500 ${
              i === current
                ? "w-6 h-1.5 bg-blue-500"
                : i < current
                  ? "w-1.5 h-1.5 bg-blue-300 cursor-pointer hover:bg-blue-400"
                  : "w-1.5 h-1.5 bg-border"
            }`}
          />
          {/* Active glow */}
          {i === current && (
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background:
                  "radial-gradient(ellipse at center, rgba(59,130,246,0.2), transparent 70%)",
              }}
            />
          )}
        </button>
      ))}
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────
export function LandingV4() {
  useFontLoader();

  const [step, setStep] = useState(0);
  const [position, setPosition] = useState<PositionType | null>(null);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const totalSteps = 6;

  const goForward = useCallback(() => {
    setDirection("forward");
    setStep((s) => Math.min(s + 1, totalSteps - 1));
  }, []);

  const goBack = useCallback(() => {
    setDirection("back");
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const goTo = useCallback(
    (s: number) => {
      setDirection(s < step ? "back" : "forward");
      setStep(s);
    },
    [step],
  );

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "Enter") {
        if (step !== 0 && step !== 4) goForward();
      }
      if (e.key === "ArrowLeft") goBack();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [step, goForward, goBack]);

  function handlePosition(pos: PositionType) {
    setPosition(pos);
    setTimeout(() => {
      setDirection("forward");
      setStep(1);
    }, 700);
  }

  return (
    <div className="h-screen bg-background overflow-hidden relative">
      <ConstellationLight />
      <AmbientGlow />
      <GrainOverlay />

      {/* Top bar — editorial minimal */}
      <div className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between px-6 py-5">
        <span className="font-mono text-[10px] tracking-[3px] uppercase text-muted-foreground/50">
          ClarityPledge
        </span>
        <a
          href="/"
          className="font-mono text-[10px] tracking-[1px] uppercase text-muted-foreground/40 hover:text-muted-foreground transition-colors duration-300"
        >
          Back to site
        </a>
      </div>

      {/* Steps */}
      <div className="relative h-full z-10">
        <StepCard visible={step === 0} direction={direction}>
          <StepPoint onPosition={handlePosition} />
        </StepCard>

        <StepCard visible={step === 1} direction={direction}>
          <StepVenn position={position} onNext={goForward} />
        </StepCard>

        <StepCard visible={step === 2} direction={direction}>
          <StepQuadrant onNext={goForward} />
        </StepCard>

        <StepCard visible={step === 3} direction={direction}>
          <StepStory onNext={goForward} />
        </StepCard>

        <StepCard visible={step === 4} direction={direction}>
          <StepExplainBack onNext={goForward} />
        </StepCard>

        <StepCard visible={step === 5} direction={direction}>
          <StepCTA />
        </StepCard>
      </div>

      <StepDots total={totalSteps} current={step} onDotClick={goTo} />

      {/* Back arrow */}
      {step > 0 && step < totalSteps - 1 && (
        <button
          onClick={goBack}
          className="fixed bottom-7 left-6 z-20 p-2.5 rounded-full text-muted-foreground/30 hover:text-muted-foreground/60 hover:bg-muted/30 transition-all duration-300"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
