/**
 * Landing V3 — "Clarity Canvas"
 *
 * Artistic landing using ClarityPledge's actual product concepts:
 * false agreements, explain-back, stories & points, calibration scores.
 * Dark palette with constellation background. Interactive elements.
 * Targeted at co-founder pairs.
 *
 * Prototype: accessible at /tree/landing-v3
 */
import { useState, useEffect, useRef } from "react";

// ============================================
// CONSTELLATION CANVAS BACKGROUND
// ============================================
function ConstellationBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const N = 55;
    const particles: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      a: number;
    }[] = [];

    function resize() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    for (let i = 0; i < N; i++) {
      particles.push({
        x: Math.random() * 2000,
        y: Math.random() * 1200,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: Math.random() * 1.5 + 0.5,
        a: Math.random() * 0.3 + 0.08,
      });
    }

    function draw() {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(59,130,246,${p.a})`;
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
            ctx.strokeStyle = `rgba(59,130,246,${0.04 * (1 - d / 140)})`;
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
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}

// ============================================
// SCROLL REVEAL
// ============================================
function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [vis, setVis] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) setVis(true);
      },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${vis ? "opacity-100 translate-y-0" : "opacity-0 translate-y-7"} ${className}`}
    >
      {children}
    </div>
  );
}

// ============================================
// CALIBRATION SLIDER (Provocation)
// ============================================
function CalibrationSlider() {
  const [confidence, setConfidence] = useState(85);
  const reality = Math.max(12, Math.round(confidence * 0.55 + (Math.sin(confidence * 0.1) * 8)));
  const gap = confidence - reality;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="space-y-4">
        {/* Confidence bar */}
        <div className="flex items-center gap-4">
          <span
            className="text-xs tracking-widest uppercase shrink-0 w-36 text-right"
            style={{ color: "#5a6878", fontFamily: "monospace", letterSpacing: "2px" }}
          >
            Confidence
          </span>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#1a2030" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${confidence}%`, background: "#3b82f6" }}
            />
          </div>
          <span className="text-sm w-11 shrink-0 text-right" style={{ color: "#3b82f6", fontFamily: "monospace" }}>
            {confidence}%
          </span>
        </div>

        {/* Reality bar */}
        <div className="flex items-center gap-4">
          <span
            className="text-xs tracking-widest uppercase shrink-0 w-36 text-right"
            style={{ color: "#5a6878", fontFamily: "monospace", letterSpacing: "2px" }}
          >
            Actual
          </span>
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#1a2030" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${reality}%`, background: "#ef4444" }}
            />
          </div>
          <span className="text-sm w-11 shrink-0 text-right" style={{ color: "#ef4444", fontFamily: "monospace" }}>
            {reality}%
          </span>
        </div>
      </div>

      {/* Slider */}
      <div className="text-center">
        <input
          type="range"
          min={30}
          max={100}
          value={confidence}
          onChange={(e) => setConfidence(Number(e.target.value))}
          className="w-full max-w-xs cursor-pointer accent-blue-500"
        />
        <p className="text-xs mt-2" style={{ color: "#3a4454" }}>
          Drag — watch the gap between how well you <em>think</em> you understood vs. reality
        </p>
      </div>

      {/* Gap indicator */}
      <div
        className="text-center py-4 rounded-lg border transition-all duration-500"
        style={{
          borderColor: gap > 30 ? "rgba(239,68,68,0.3)" : "rgba(59,130,246,0.2)",
          background: gap > 30 ? "rgba(239,68,68,0.04)" : "rgba(59,130,246,0.04)",
        }}
      >
        <span
          className="text-3xl font-light"
          style={{ fontFamily: "monospace", color: gap > 30 ? "#ef4444" : "#3b82f6" }}
        >
          {gap}pt
        </span>
        <p className="text-xs mt-1" style={{ color: "#5a6878" }}>
          {gap > 40
            ? "False agreement zone — you're flying blind"
            : gap > 25
              ? "Significant gap — hidden misalignment"
              : "Calibrated — rare"}
        </p>
      </div>
    </div>
  );
}

// ============================================
// FOUR STATES OF AGREEMENT
// ============================================
const fourStates = [
  {
    id: "false-agreement",
    label: "False Agreement",
    color: "#ef4444",
    colorDim: "rgba(239,68,68,0.08)",
    desc: "Both think they agree. Neither checked. The most dangerous state — invisible until it explodes.",
    detection: "High — explain-back surfaces it before it costs you",
    icon: "!",
  },
  {
    id: "false-disagreement",
    label: "False Disagreement",
    color: "#f59e0b",
    colorDim: "rgba(245,158,11,0.08)",
    desc: "Positions seem opposed, but it's a misunderstanding. You're burning energy fighting ghosts.",
    detection: "High — verification resolves it in minutes",
    icon: "?",
  },
  {
    id: "true-disagreement",
    label: "True Disagreement",
    color: "#8b5cf6",
    colorDim: "rgba(139,92,246,0.08)",
    desc: "You disagree AND understand each other. Productive tension — at least it's honest.",
    detection: "Medium — clarifies what you're actually debating",
    icon: "≠",
  },
  {
    id: "true-agreement",
    label: "True Agreement",
    color: "#22c55e",
    colorDim: "rgba(34,197,94,0.08)",
    desc: "You agree AND mean the same thing. Verified. Stop revisiting it — move forward.",
    detection: "Confirmed — the explain-back proves it",
    icon: "✓",
  },
];

function FourStatesGrid() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-px max-w-3xl mx-auto rounded-xl overflow-hidden" style={{ background: "#1a2030" }}>
      {fourStates.map((s) => (
        <button
          key={s.id}
          onClick={() => setExpanded(expanded === s.id ? null : s.id)}
          className="text-left p-6 sm:p-8 transition-all duration-400"
          style={{
            background: expanded === s.id ? "#11151c" : "#0c0f14",
            cursor: "pointer",
            border: "none",
          }}
        >
          <div
            className="text-xs tracking-widest uppercase mb-2"
            style={{ color: s.color, fontFamily: "monospace", letterSpacing: "3px", fontSize: "9px" }}
          >
            {s.icon}
          </div>
          <div className="text-lg font-medium mb-1" style={{ color: "#e8eef6" }}>
            {s.label}
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "#5a6878" }}>
            {s.desc}
          </p>
          <div
            className="overflow-hidden transition-all duration-500"
            style={{
              maxHeight: expanded === s.id ? "100px" : "0",
              opacity: expanded === s.id ? 1 : 0,
            }}
          >
            <div
              className="mt-4 text-xs px-3 py-2 rounded-md border"
              style={{
                fontFamily: "monospace",
                borderColor: `${s.color}33`,
                background: s.colorDim,
                color: s.color,
              }}
            >
              Detection value: {s.detection}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ============================================
// EXPLAIN-BACK TEST (Comprehension Simulation)
// ============================================
function ExplainBackTest() {
  const [selected, setSelected] = useState<number | null>(null);

  const options = [
    {
      text: "You want to pivot because the current product isn't working and you think we need a completely new direction.",
      score: 25,
      label: "wrong" as const,
      feedback:
        "You projected a conclusion ('pivot') that was never stated. The speaker said 'rethink our approach' — which could mean iterate, not pivot. This is how false agreements form.",
    },
    {
      text: "You're concerned that our current go-to-market isn't producing results fast enough, and you want us to explore whether our positioning or channel strategy needs to change — but you're not suggesting we change the product itself.",
      score: 88,
      label: "correct" as const,
      feedback:
        "You captured the distinction between product and GTM, identified the urgency, and noted what was NOT being said. A co-founder would feel understood.",
    },
    {
      text: "You think marketing needs more budget and we should hire a growth person.",
      score: 35,
      label: "partial" as const,
      feedback:
        "You jumped to a solution the speaker never mentioned. 'Rethink our approach' ≠ 'spend more money.' You heard the frustration but missed the reasoning.",
    },
  ];

  const scoreColor = (label: string) =>
    label === "correct" ? "#22c55e" : label === "partial" ? "#f59e0b" : "#ef4444";

  return (
    <div className="max-w-2xl mx-auto rounded-xl overflow-hidden border" style={{ borderColor: "#1a2030" }}>
      {/* Original statement */}
      <div className="p-7" style={{ background: "#0c0f14", borderBottom: "1px solid #1a2030" }}>
        <div
          className="text-xs tracking-widest uppercase mb-3"
          style={{ color: "#3b82f6", fontFamily: "monospace", letterSpacing: "3px", fontSize: "9px" }}
        >
          Your co-founder says
        </div>
        <blockquote
          className="text-lg leading-relaxed italic"
          style={{ color: "#f4f8fc", fontFamily: "'Georgia', serif" }}
        >
          "I think we need to rethink our approach to getting customers. What we're doing isn't scaling and I'm worried we'll burn through our runway before we find what works."
        </blockquote>
      </div>

      {/* Response options */}
      <div className="p-7" style={{ background: "#06080b" }}>
        <div
          className="text-xs tracking-widest uppercase mb-4"
          style={{ color: "#22c55e", fontFamily: "monospace", letterSpacing: "3px", fontSize: "9px" }}
        >
          Explain back — which is most accurate?
        </div>

        <div className="space-y-3">
          {options.map((opt, i) => (
            <button
              key={i}
              disabled={selected !== null}
              onClick={() => setSelected(i)}
              className="w-full text-left p-4 rounded-lg border transition-all duration-300"
              style={{
                borderColor:
                  selected !== null
                    ? scoreColor(opt.label) + "66"
                    : "#1a2030",
                background:
                  selected !== null
                    ? scoreColor(opt.label) + "08"
                    : "transparent",
                color: selected !== null ? (opt.label === "correct" ? "#f4f8fc" : "#b8c4d4") : "#b8c4d4",
                cursor: selected !== null ? "default" : "pointer",
                fontSize: "14px",
                lineHeight: "1.6",
              }}
            >
              {opt.text}
            </button>
          ))}
        </div>

        {/* Result */}
        {selected !== null && (
          <div
            className="mt-6 p-5 rounded-lg border text-center"
            style={{ borderColor: "#1a2030" }}
          >
            <div
              className="text-xs tracking-widest uppercase mb-2"
              style={{ color: "#5a6878", fontFamily: "monospace", letterSpacing: "3px", fontSize: "9px" }}
            >
              Comprehension accuracy
            </div>
            <div
              className="text-4xl font-light mb-1"
              style={{ fontFamily: "monospace", color: scoreColor(options[selected].label) }}
            >
              {options[selected].score}%
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "#5a6878" }}>
              {options[selected].feedback}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// CLARITY SCORE RING
// ============================================
function ClarityScoreRing() {
  const [animated, setAnimated] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setAnimated(true);
          obs.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const score = 62;
  const circumference = 2 * Math.PI * 85;
  const offset = circumference - (circumference * (animated ? score : 0)) / 100;

  const bars = [
    { label: "Understanding", value: animated ? 78 : 0, color: "#3b82f6" },
    { label: "Calibration", value: animated ? 62 : 0, color: "#22c55e" },
    { label: "False agreements caught", value: animated ? 45 : 0, color: "#f59e0b" },
    { label: "Stories verified", value: animated ? 54 : 0, color: "#8b5cf6" },
  ];

  return (
    <div ref={ref} className="max-w-md mx-auto">
      {/* Ring */}
      <div className="relative w-48 h-48 mx-auto mb-10">
        <svg viewBox="0 0 200 200" className="w-full h-full">
          <circle cx="100" cy="100" r="85" fill="none" stroke="#1a2030" strokeWidth="4" />
          <circle
            cx="100"
            cy="100"
            r="85"
            fill="none"
            stroke="#3b82f6"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 100 100)"
            style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.16,1,0.3,1)" }}
          />
        </svg>
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-5xl font-light"
          style={{ fontFamily: "monospace", color: "#f4f8fc" }}
        >
          {animated ? score : 0}
        </div>
      </div>

      {/* Bars */}
      <div className="space-y-4">
        {bars.map((b) => (
          <div key={b.label} className="flex items-center gap-3">
            <span
              className="text-xs tracking-wider uppercase w-44 text-right shrink-0"
              style={{ color: b.color, fontFamily: "monospace", letterSpacing: "1px", fontSize: "10px" }}
            >
              {b.label}
            </span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#1a2030" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${b.value}%`,
                  background: b.color,
                  transition: "width 1.2s cubic-bezier(0.16,1,0.3,1)",
                }}
              />
            </div>
            <span className="text-sm w-8 shrink-0" style={{ fontFamily: "monospace", color: b.color }}>
              {b.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// STORIES & POINTS NODE VISUALIZATION
// ============================================
function StoryPointsMap() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const nodes = [
    {
      id: "story1",
      type: "story" as const,
      label: "Founder Story",
      x: 200,
      y: 100,
      desc: "\"We agreed to focus on enterprise. Six months later I discovered my co-founder had been pitching SMBs the whole time. We used the same word — 'focus' — and meant opposite things.\"",
      state: "verified" as const,
    },
    {
      id: "point1",
      type: "point" as const,
      label: "Co-founders overestimate alignment",
      x: 500,
      y: 80,
      desc: "Falsifiable claim: co-founder pairs rate their alignment 30%+ higher than verified calibration scores show.",
      state: "verified" as const,
    },
    {
      id: "point2",
      type: "point" as const,
      label: "False agreement costs more than disagreement",
      x: 650,
      y: 220,
      desc: "Open disagreement surfaces in weeks. False agreement festers for months — by then, trust is gone.",
      state: "hypothesis" as const,
    },
    {
      id: "story2",
      type: "story" as const,
      label: "The 'Strategy' Meeting",
      x: 150,
      y: 300,
      desc: "\"After our strategy offsite, we asked each co-founder to write down the top 3 priorities independently. Zero overlap. They'd spent 8 hours 'agreeing.'\"",
      state: "verified" as const,
    },
    {
      id: "point3",
      type: "point" as const,
      label: "Understanding ≠ Agreement",
      x: 400,
      y: 280,
      desc: "People conflate three things: cognitive understanding, emotional resonance, and agreement. Mixing them causes silent failures.",
      state: "verified" as const,
    },
    {
      id: "story3",
      type: "story" as const,
      label: "The Exit Conversation",
      x: 600,
      y: 380,
      desc: "\"My co-founder said 'I never felt heard.' I was shocked — I'd agreed with everything she said. Turns out, agreeing isn't the same as understanding.\"",
      state: "hypothesis" as const,
    },
    {
      id: "point4",
      type: "point" as const,
      label: "Explain-back is the only reliable test",
      x: 300,
      y: 430,
      desc: "Self-report of understanding correlates only r=0.178 with actual comprehension (Yang et al. 2023, N=15,889). The explain-back protocol closes that gap.",
      state: "verified" as const,
    },
  ];

  const edges = [
    ["story1", "point1"],
    ["story1", "point3"],
    ["point1", "point2"],
    ["story2", "point1"],
    ["story2", "point3"],
    ["point3", "story3"],
    ["point3", "point4"],
    ["story3", "point2"],
    ["story2", "point4"],
  ];

  const stateColor = {
    verified: "#22c55e",
    hypothesis: "#f59e0b",
    challenged: "#ef4444",
    empty: "#2a3040",
  };

  const selectedNode = nodes.find((n) => n.id === selected);

  return (
    <div className="max-w-4xl mx-auto">
      <svg ref={svgRef} viewBox="0 0 800 500" className="w-full">
        {/* Edges */}
        {edges.map(([a, b]) => {
          const na = nodes.find((n) => n.id === a)!;
          const nb = nodes.find((n) => n.id === b)!;
          return (
            <line
              key={`${a}-${b}`}
              x1={na.x}
              y1={na.y}
              x2={nb.x}
              y2={nb.y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1"
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const color = stateColor[node.state];
          const isStory = node.type === "story";
          return (
            <g
              key={node.id}
              className="cursor-pointer"
              onClick={() => setSelected(selected === node.id ? null : node.id)}
              tabIndex={0}
              role="button"
              aria-label={node.label}
            >
              {/* Glow */}
              {node.state === "verified" && (
                <circle cx={node.x} cy={node.y} r="28" fill="none" stroke={color} strokeWidth="1" opacity="0.15" />
              )}
              {/* Shape: circle for stories, diamond-like for points */}
              {isStory ? (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r="18"
                  fill={`${color}15`}
                  stroke={color}
                  strokeWidth="2"
                />
              ) : (
                <rect
                  x={node.x - 14}
                  y={node.y - 14}
                  width="28"
                  height="28"
                  rx="6"
                  fill={`${color}15`}
                  stroke={color}
                  strokeWidth="2"
                  transform={`rotate(0 ${node.x} ${node.y})`}
                />
              )}
              {/* Inner dot */}
              <circle cx={node.x} cy={node.y} r="3.5" fill={color} />
              {/* Label */}
              <text
                x={node.x}
                y={node.y + 34}
                textAnchor="middle"
                fill="#b8c4d4"
                fontSize="11"
                fontFamily="'Inter', sans-serif"
                fontWeight="500"
              >
                {node.label}
              </text>
              {/* Type badge */}
              <text
                x={node.x}
                y={node.y + 47}
                textAnchor="middle"
                fill={isStory ? "#3b82f6" : "#8b5cf6"}
                fontSize="8"
                fontFamily="monospace"
                opacity="0.6"
              >
                {isStory ? "STORY" : "POINT"} · {node.state}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Detail panel */}
      <div
        className="max-w-3xl mx-auto rounded-xl border overflow-hidden transition-all duration-500"
        style={{
          borderColor: "#1a2030",
          background: "#0c0f14",
          maxHeight: selectedNode ? "300px" : "0",
          padding: selectedNode ? "24px 28px" : "0 28px",
          opacity: selectedNode ? 1 : 0,
        }}
      >
        {selectedNode && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: stateColor[selectedNode.state] }}
              />
              <span className="text-lg" style={{ color: "#f4f8fc" }}>
                {selectedNode.label}
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded ml-2"
                style={{
                  fontFamily: "monospace",
                  color: selectedNode.type === "story" ? "#3b82f6" : "#8b5cf6",
                  background: selectedNode.type === "story" ? "rgba(59,130,246,0.1)" : "rgba(139,92,246,0.1)",
                  letterSpacing: "1px",
                  fontSize: "9px",
                }}
              >
                {selectedNode.type.toUpperCase()}
              </span>
              <button
                onClick={() => setSelected(null)}
                className="ml-auto text-lg px-2"
                style={{ color: "#5a6878", background: "none", border: "none", cursor: "pointer" }}
              >
                ×
              </button>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "#b8c4d4" }}>
              {selectedNode.desc}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================
// MAIN LANDING V3
// ============================================
export function LandingV3() {
  const [heroReady, setHeroReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setHeroReady(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ background: "#06080b", color: "#b8c4d4" }} className="min-h-screen selection:bg-blue-500/20">
      {/* Subtle grain overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[9999]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E")`,
        }}
      />

      {/* ===== HERO ===== */}
      <section className="min-h-screen flex flex-col justify-center items-center text-center px-6 relative">
        <ConstellationBg />
        <div className="relative z-10">
          <div
            className={`text-xs tracking-[5px] uppercase mb-10 transition-all duration-1000 ${heroReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-7"}`}
            style={{ color: "#3b82f6", fontFamily: "monospace", fontSize: "10px" }}
          >
            ClarityPledge
          </div>

          <h1
            className={`font-light leading-[1.08] tracking-tight mb-9 transition-all duration-1000 delay-200 ${heroReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-7"}`}
            style={{
              fontFamily: "'Georgia', serif",
              fontSize: "clamp(40px, 7vw, 84px)",
              color: "#f4f8fc",
              letterSpacing: "-1.5px",
            }}
          >
            Do you actually
            <br />
            understand each other?
          </h1>

          <p
            className={`text-base leading-8 max-w-md mx-auto mb-12 transition-all duration-1000 delay-500 ${heroReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-7"}`}
            style={{ color: "#5a6878" }}
          >
            Co-founders assume alignment.
            <br />
            ClarityPledge measures it.
            <br />
            <br />
            Stories & Points. Explain-back.
            <br />
            The gap between confidence and reality.
          </p>

          <a
            href="#provocation"
            className={`inline-flex items-center gap-2.5 text-xs tracking-[2px] uppercase px-8 py-3.5 rounded-full border transition-all duration-400 ${heroReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-7"}`}
            style={{
              color: "#3b82f6",
              borderColor: "rgba(59,130,246,0.3)",
              fontFamily: "monospace",
              transitionDelay: "0.7s",
              background: "transparent",
              textDecoration: "none",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(59,130,246,0.08)";
              e.currentTarget.style.borderColor = "#3b82f6";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "rgba(59,130,246,0.3)";
            }}
          >
            See the gap
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 1v12M1 7l6 6 6-6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>
      </section>

      {/* ===== PROVOCATION: THE CALIBRATION GAP ===== */}
      <section id="provocation" className="py-24 sm:py-32 px-6">
        <Reveal>
          <div className="max-w-2xl mx-auto text-center">
            <div
              className="text-xs tracking-[4px] uppercase mb-12"
              style={{ color: "#5a6878", fontFamily: "monospace" }}
            >
              The calibration gap
            </div>

            <p className="text-lg leading-relaxed mb-12" style={{ color: "#b8c4d4" }}>
              Research shows self-assessed understanding correlates only{" "}
              <span style={{ color: "#3b82f6" }}>r = 0.178</span> with actual
              comprehension. Barely better than a coin toss.
              <br />
              <span style={{ color: "#5a6878", fontSize: "13px" }}>
                — Yang et al. 2023, N=15,889
              </span>
            </p>

            <CalibrationSlider />
          </div>
        </Reveal>
      </section>

      {/* ===== FOUR STATES OF AGREEMENT ===== */}
      <section className="py-24 sm:py-32 px-6" style={{ background: "#0c0f14", borderTop: "1px solid #1a2030", borderBottom: "1px solid #1a2030" }}>
        <Reveal>
          <div className="text-center mb-16">
            <h2
              className="font-light mb-3"
              style={{
                fontFamily: "'Georgia', serif",
                fontSize: "clamp(28px, 4.5vw, 48px)",
                color: "#f4f8fc",
              }}
            >
              Four states of agreement
            </h2>
            <p className="text-sm" style={{ color: "#5a6878" }}>
              Only two are real. ClarityPledge detects the false ones.
            </p>
          </div>
          <FourStatesGrid />
        </Reveal>
      </section>

      {/* ===== STORIES & POINTS MAP ===== */}
      <section className="py-24 sm:py-32 px-6">
        <Reveal>
          <div className="text-center mb-4">
            <h2
              className="font-light mb-3"
              style={{
                fontFamily: "'Georgia', serif",
                fontSize: "clamp(26px, 4vw, 44px)",
                color: "#f4f8fc",
              }}
            >
              Stories & Points
            </h2>
            <p className="text-sm max-w-lg mx-auto" style={{ color: "#5a6878" }}>
              Stories are the "why" — lived experiences. Points are the "what" — falsifiable claims.
              Click any node to explore how they connect.
            </p>
          </div>
          <StoryPointsMap />
        </Reveal>
      </section>

      {/* ===== EXPLAIN-BACK TEST ===== */}
      <section className="py-24 sm:py-32 px-6" style={{ background: "#0c0f14", borderTop: "1px solid #1a2030", borderBottom: "1px solid #1a2030" }}>
        <Reveal>
          <div className="text-center mb-12">
            <h2
              className="font-light mb-3"
              style={{
                fontFamily: "'Georgia', serif",
                fontSize: "clamp(24px, 4vw, 36px)",
                color: "#f4f8fc",
              }}
            >
              The Explain-Back Test
            </h2>
            <p className="text-sm" style={{ color: "#5a6878" }}>
              Can you prove you understood? Try it.
            </p>
          </div>
          <ExplainBackTest />
        </Reveal>
      </section>

      {/* ===== CLARITY SCORE ===== */}
      <section className="py-24 sm:py-32 px-6">
        <Reveal>
          <div className="text-center mb-12">
            <h2
              className="font-light mb-3"
              style={{
                fontFamily: "'Georgia', serif",
                fontSize: "clamp(24px, 4vw, 36px)",
                color: "#f4f8fc",
              }}
            >
              Calibration Score
            </h2>
            <p className="text-sm" style={{ color: "#5a6878" }}>
              Your understanding made visible. Not a feeling — a number.
            </p>
          </div>
          <ClarityScoreRing />
        </Reveal>
      </section>

      {/* ===== HOW IT WORKS — TIMELINE ===== */}
      <section className="py-24 sm:py-32 px-6" style={{ background: "#0c0f14", borderTop: "1px solid #1a2030", borderBottom: "1px solid #1a2030" }}>
        <Reveal>
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-16">
              <h2
                className="font-light mb-3"
                style={{
                  fontFamily: "'Georgia', serif",
                  fontSize: "clamp(26px, 4.5vw, 44px)",
                  color: "#f4f8fc",
                }}
              >
                How a session works
              </h2>
              <p className="text-sm" style={{ color: "#5a6878" }}>
                60 minutes. Both co-founders. One real decision.
              </p>
            </div>

            <div className="relative pl-10">
              {/* Timeline line */}
              <div
                className="absolute left-3.5 top-0 bottom-0 w-px"
                style={{ background: "linear-gradient(to bottom, #253045, #1a2030, #253045)" }}
              />

              {[
                {
                  title: "Pick a real decision",
                  desc: "Not a hypothetical. The decision you've been circling — strategy, hiring, equity, roadmap.",
                },
                {
                  title: "Share your position",
                  desc: "Each co-founder explains their view. The other listens. No interrupting.",
                },
                {
                  title: "Explain back",
                  desc: "Explain what your co-founder meant — not their words, their reasoning. They rate: \"How well did they get it?\"",
                },
                {
                  title: "See the gap",
                  desc: "Your confidence vs. their rating. The gap is your calibration score. This is where most founders say: \"I had no idea.\"",
                },
                {
                  title: "Surface false agreements",
                  desc: "Where you thought you agreed but meant different things. Where you thought you disagreed but actually aligned. Both are actionable.",
                },
              ].map((step, i) => (
                <Reveal key={i}>
                  <div className="relative mb-12 pl-7 last:mb-0">
                    <div
                      className="absolute -left-[25px] top-1 w-3 h-3 rounded-full border-2"
                      style={{ borderColor: "#253045", background: "#06080b" }}
                    />
                    <h4 className="text-base font-medium mb-1" style={{ color: "#f4f8fc" }}>
                      {step.title}
                    </h4>
                    <p className="text-sm" style={{ color: "#5a6878", lineHeight: "1.7" }}>
                      {step.desc}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ===== CORE INSIGHT ===== */}
      <section className="py-40 px-6 text-center relative">
        {/* Subtle glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(59,130,246,0.04) 0%, transparent 70%)" }}
        />
        <Reveal>
          <h2
            className="font-light leading-snug relative mb-6"
            style={{
              fontFamily: "'Georgia', serif",
              fontSize: "clamp(30px, 5.5vw, 54px)",
              color: "#f4f8fc",
              fontStyle: "italic",
            }}
          >
            Scale your inner world.
            <br />
            Know who understood you,
            <br />
            <span
              style={{
                background: "linear-gradient(135deg, #3b82f6, #22c55e)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                fontStyle: "normal",
              }}
            >
              and where they diverge.
            </span>
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
            <a
              href="/live"
              className="inline-flex items-center gap-2.5 text-xs tracking-[2px] uppercase px-8 py-3.5 rounded-full transition-all duration-300"
              style={{
                fontFamily: "monospace",
                background: "#3b82f6",
                color: "#06080b",
                fontWeight: 600,
                textDecoration: "none",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#60a5fa")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#3b82f6")}
            >
              Start a session
            </a>
            <a
              href="/sign-pledge"
              className="inline-flex items-center gap-2.5 text-xs tracking-[2px] uppercase px-8 py-3.5 rounded-full border transition-all duration-300"
              style={{
                fontFamily: "monospace",
                borderColor: "rgba(59,130,246,0.3)",
                color: "#3b82f6",
                textDecoration: "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(59,130,246,0.08)";
                e.currentTarget.style.borderColor = "#3b82f6";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "rgba(59,130,246,0.3)";
              }}
            >
              Take the pledge
            </a>
          </div>
          <div
            className="mt-6 text-xs tracking-[6px] uppercase"
            style={{ color: "#3b82f6", fontFamily: "monospace" }}
          >
            ClarityPledge
          </div>
        </Reveal>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="py-8 px-6 text-center border-t" style={{ borderColor: "#1a2030" }}>
        <p className="text-xs" style={{ fontFamily: "monospace", color: "#3a4454", letterSpacing: "1px" }}>
          ClarityPledge · Stories & Points · Explain-back Protocol · Open Source
        </p>
      </footer>
    </div>
  );
}
