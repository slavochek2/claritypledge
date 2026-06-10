import { useState, useEffect, useRef } from "react";

/**
 * Animated illusion Venn — one diagram, two states, looping:
 * problem (huge blue fog = assumed shared understanding, red dot far out in thin
 * fog, dashed ghost near the core = where they BELIEVE the dot is, "Assumed
 * Shared Understanding: They wrongly believe…") → verified (fog condenses into
 * the small crisp blue overlap, dot moves inside, turns blue, "Verified
 * Understanding: You both know they understand you" — caption stays in the
 * diagram's second-person frame: What YOU mean / what THEY understand).
 * Fuzzy-vs-crisp maps the epistemic state to visual texture: unverified
 * understanding has no known boundary (fog), verification draws one (crisp lens).
 * The fog is the same hue as the verified core, just diffuse — assumed and
 * verified are the same substance at different epistemic intensity. It spans
 * most of BOTH private circles (people assume nearly everything they said
 * landed), with radial falloff instead of a boundary: assumption density thins
 * with distance, it never "ends". The ghost-vs-real dot gap is the illusion:
 * they place the dot at ~9, it actually sits at ~3.
 * Echoes the st3 story image (assumed lens ⊃ verified core), radicalized.
 *
 * Extracted from coach-partnership-page (P916) into a shared landing component
 * so both the coach landing and the founder program page render the same v2
 * fog-vs-verified diagram. Moved verbatim — no logic change.
 */
export function MisunderstandingVenn() {
  const [verified, setVerified] = useState(false);
  const [inView, setInView] = useState(false);
  const ref = useRef<SVGSVGElement>(null);

  // Start the loop only once the diagram is actually on screen — otherwise the
  // first transition fires before anyone is looking and goes unnoticed.
  // Observe-once (disconnect after first entry): re-arming on every scroll
  // crossing resets the 1.6s first-flip timer and leaves the dot stuck in
  // whatever state the teardown caught (review finding).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    // first flip soon after it's visible, then a slower steady loop
    const first = setTimeout(() => setVerified(true), 1600);
    const interval = setInterval(() => setVerified((v) => !v), 3500);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [inView]);

  return (
    <svg
      ref={ref}
      viewBox="0 0 640 384"
      role="img"
      aria-label="Two circles barely overlapping: what you mean and what they understand. A diffuse blue fog covering most of both circles is the assumed shared understanding: they wrongly believe they understand you. A red dot far out in the thin fog is where their understanding actually sits; a dashed ghost near the small true overlap is where they believe it sits. On verification the fog condenses into a small crisp blue overlap and the dot moves inside and turns blue: verified understanding, you both know they understand you."
      className="w-full max-w-xl lg:max-w-2xl mx-auto"
    >
      <defs>
        <clipPath id="root-cause-left-circle">
          <circle cx="195" cy="160" r="140" />
        </clipPath>
        {/* union of both circles — the fog lives only inside what someone holds */}
        <clipPath id="circles-union">
          <circle cx="195" cy="160" r="140" />
          <circle cx="445" cy="160" r="140" />
        </clipPath>
        {/* arc masks — split each circle's stroke at the other circle's boundary.
            Outer arcs (outside the other circle) are always shown; the inner arcs
            that outline the lens only appear on verify. An unverified overlap has
            no drawable boundary — showing the crossing arcs in the assumed state
            would claim the target region is already known (founder feedback). */}
        <mask id="outside-right">
          <rect x="0" y="0" width="640" height="384" fill="white" />
          <circle cx="445" cy="160" r="141.5" fill="black" />
        </mask>
        <mask id="outside-left">
          <rect x="0" y="0" width="640" height="384" fill="white" />
          <circle cx="195" cy="160" r="141.5" fill="black" />
        </mask>
        <mask id="inside-right">
          <rect x="0" y="0" width="640" height="384" fill="black" />
          <circle cx="445" cy="160" r="141.5" fill="white" />
        </mask>
        <mask id="inside-left">
          <rect x="0" y="0" width="640" height="384" fill="black" />
          <circle cx="195" cy="160" r="141.5" fill="white" />
        </mask>
        {/* radial falloff: assumption density thins with distance from the core —
            no boundary, because unverified understanding has none */}
        <radialGradient id="assumed-fog">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.28" />
          <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* assumed fog — same hue as the verified core, just diffuse. Spans most of
          both private circles: people assume nearly everything they said landed.
          Condenses into the crisp core on verify. */}
      <ellipse
        cx="320" cy="160" rx="235" ry="150"
        fill="url(#assumed-fog)"
        clipPath="url(#circles-union)"
        className="transition-opacity duration-1000 ease-in-out"
        style={{ opacity: verified ? 0 : 1 }}
      />
      {/* the small true overlap — crisp. Fully hidden in the problem state (an
          unverified target region doesn't exist yet), solid blue once verified:
          the fog condenses into this. */}
      <circle
        cx="445" cy="160" r="140"
        className="fill-blue-500/25 transition-opacity duration-1000 ease-in-out"
        clipPath="url(#root-cause-left-circle)"
        style={{ opacity: verified ? 1 : 0 }}
      />
      {/* circle outlines — outer arcs always visible; the inner arcs that outline
          the lens fade in WITH verification: verifying is what draws the boundary.
          In the assumed state the two minds read as one open blob under fog. */}
      <circle cx="195" cy="160" r="140" fill="none" className="stroke-muted-foreground/50" strokeWidth="2" mask="url(#outside-right)" />
      <circle cx="445" cy="160" r="140" fill="none" className="stroke-blue-500" strokeWidth="2" mask="url(#outside-left)" />
      <g className="transition-opacity duration-1000 ease-in-out" style={{ opacity: verified ? 1 : 0 }}>
        <circle cx="195" cy="160" r="140" fill="none" className="stroke-muted-foreground/50" strokeWidth="2" mask="url(#inside-right)" />
        <circle cx="445" cy="160" r="140" fill="none" className="stroke-blue-500" strokeWidth="2" mask="url(#inside-left)" />
      </g>
      <text x="180" y="152" textAnchor="middle" className="fill-foreground" fontSize="22" fontWeight="600">
        What you
        <tspan x="180" dy="28">mean</tspan>
      </text>
      <text x="460" y="152" textAnchor="middle" className="fill-foreground" fontSize="22" fontWeight="600">
        What they
        <tspan x="460" dy="28">understand</tspan>
      </text>
      {/* ghost dot + gap line — where they BELIEVE their understanding sits vs
          where it actually is (the red dot, demonstratively far). The ghost is
          NEAR the verified core but deliberately OUTSIDE it: they can't believe
          it's verified (it isn't) — they believe it's much CLOSER to verified
          than it actually is. Soft blue dashed = it belongs to the ASSUMED system
          (fog, caption header); red is reserved for the real dot alone. The
          neutral dashed gap between the two IS the illusion. Problem state only. */}
      <g className="transition-opacity duration-700" style={{ opacity: verified ? 0 : 1 }}>
        <circle cx="348" cy="180" r="6.5" fill="none" stroke="#60a5fa" strokeWidth="1.75" strokeDasharray="3 3" />
        {/* bowed below the "What they understand" label so the gap line never
            collides with the text */}
        <path d="M 356 186 Q 450 224 545 194" fill="none" className="stroke-muted-foreground/50" strokeWidth="1.25" strokeDasharray="4 4" />
        {/* micro-labels — each dot names its own referent, color-matched, so the
            caption lines below don't have to do the pointing (founder finding:
            "Assumed…" read as fog OR ghost, "They wrongly believe…" as the red
            dot — two referents, no pointers) */}
        <text x="338" y="208" textAnchor="end" fontSize="13.5" fontStyle="italic" fill="#60a5fa">
          they think it&apos;s here
        </text>
        <text x="560" y="222" textAnchor="end" fontSize="13.5" fontStyle="italic" fill="#ef4444">
          it&apos;s actually here
        </text>
      </g>
      {/* belief dot — demonstratively far: near the FAR edge of their circle,
          opposite the overlap (red: feels shared, couldn't be further from it)
          → inside the crisp overlap (blue, verified). The expanding ring pulses
          in the problem state to draw the eye to the element that's about to move. */}
      <circle
        cx="552"
        cy="192"
        r="6"
        fill="none"
        stroke="#ef4444"
        strokeWidth="2"
        className={verified ? "opacity-0" : "animate-ping origin-center [transform-box:fill-box]"}
      />
      <circle
        cx="552"
        cy="192"
        r="6"
        className="transition-all duration-1000 ease-in-out"
        style={{
          fill: verified ? "#3b82f6" : "#ef4444",
          transform: verified ? "translate(-232px, -42px)" : "translate(0, 0)",
        }}
      />
      {/* single-line caption below the diagram (zone-name headers removed — the
          color-matched dot micro-labels carry the referents now; founder call).
          Flip sequence: strike draws through the wrong belief (0–400ms) → struck
          sentence fades (450–950ms) → verified sentence fades in (1000–1500ms).
          Verification visibly cancels the illusion before replacing it. The
          sequenced fade (not a plain crossfade) prevents the two strings
          rendering overlapped as garbled text (visual QA finding). */}
      <g
        className="transition-opacity duration-500"
        style={{ opacity: verified ? 0 : 1, transitionDelay: verified ? "450ms" : "550ms" }}
      >
        <text x="320" y="362" textAnchor="middle" fill="#ef4444" fontSize="18" fontStyle="italic">
          They wrongly believe they understand you
        </text>
        {/* strikethrough — draws left-to-right via dashoffset on verify; solid
            verified-blue: the verifying act is what cancels the wrong belief */}
        <line
          x1="160" y1="356" x2="480" y2="356"
          stroke="#3b82f6" strokeWidth="1.75" strokeDasharray="320"
          style={{ strokeDashoffset: verified ? 0 : 320, transition: "stroke-dashoffset 400ms ease-in-out" }}
        />
      </g>
      <g
        className="transition-opacity duration-500"
        style={{ opacity: verified ? 1 : 0, transitionDelay: verified ? "1000ms" : "0ms" }}
      >
        <text x="320" y="362" textAnchor="middle" fill="#3b82f6" fontSize="18" fontStyle="italic">
          You both know they understand you
        </text>
      </g>
    </svg>
  );
}
