/**
 * @file loading-demo-page.tsx
 * @description Demo page for comparing loading animation variants.
 * Temporary — will be deleted after picking the best option.
 * Route: /loading-demo
 */

/* ── brand constants (from clarity-logo.tsx) ─────────────────────── */
const BRAND_BLUE = "#3b82f6";
const C_PATH = "M88 40.5 C 82 35 73 32 64 32 C 44 32 32 48 32 64 C 32 80 44 96 64 96 C 73 96 82 93 88 87.5";

/* ── inline keyframes (no index.css changes needed) ──────────────── */
const keyframes = `
@keyframes clarity-draw {
  0% { stroke-dashoffset: 200; opacity: 0.3; }
  60% { opacity: 1; }
  100% { stroke-dashoffset: 0; opacity: 1; }
}
@keyframes clarity-draw-loop {
  0% { stroke-dashoffset: 200; opacity: 0.4; }
  50% { stroke-dashoffset: 0; opacity: 1; }
  100% { stroke-dashoffset: 200; opacity: 0.4; }
}
@keyframes clarity-breathe {
  0%, 100% { transform: scale(1); opacity: 0.7; }
  50% { transform: scale(1.08); opacity: 1; }
}
@keyframes clarity-focus {
  0% { filter: blur(8px); opacity: 0.3; transform: scale(0.92); }
  100% { filter: blur(0px); opacity: 1; transform: scale(1); }
}
@keyframes clarity-focus-loop {
  0%, 100% { filter: blur(6px); opacity: 0.4; transform: scale(0.94); }
  50% { filter: blur(0px); opacity: 1; transform: scale(1); }
}
@keyframes clarity-ripple {
  0% { r: 20; opacity: 0.6; }
  100% { r: 60; opacity: 0; }
}
@keyframes clarity-fade-scale {
  0%, 100% { opacity: 0.5; transform: scale(0.95); }
  50% { opacity: 1; transform: scale(1); }
}
@keyframes clarity-morph {
  0% { d: path("M64 32 C 44 32 32 48 32 64 C 32 80 44 96 64 96"); opacity: 0.4; }
  50% { d: path("M88 40.5 C 82 35 73 32 64 32 C 44 32 32 48 32 64 C 32 80 44 96 64 96 C 73 96 82 93 88 87.5"); opacity: 1; }
  100% { d: path("M64 32 C 44 32 32 48 32 64 C 32 80 44 96 64 96"); opacity: 0.4; }
}
@keyframes clarity-c-focus {
  0%, 100% { filter: blur(4px); opacity: 0.3; }
  50% { filter: blur(0px); opacity: 1; }
}
@keyframes clarity-c-focus-once {
  0% { filter: blur(6px); opacity: 0; }
  100% { filter: blur(0px); opacity: 1; }
}
@keyframes clarity-c-breathe-subtle {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}
@keyframes clarity-draw-then-focus {
  0% { stroke-dashoffset: 200; filter: blur(3px); opacity: 0; }
  50% { stroke-dashoffset: 0; filter: blur(2px); opacity: 0.7; }
  70% { stroke-dashoffset: 0; filter: blur(0px); opacity: 1; }
  100% { stroke-dashoffset: 0; filter: blur(0px); opacity: 1; }
}
@keyframes clarity-draw-settle {
  0% { stroke-dashoffset: 200; opacity: 0.3; }
  60% { stroke-dashoffset: 0; opacity: 1; }
  100% { stroke-dashoffset: 0; opacity: 1; }
}
`;

/* ── shared wrapper ──────────────────────────────────────────────── */
function DemoCard({ title, description, children, tag }: {
  title: string;
  description: string;
  children: React.ReactNode;
  tag?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center gap-4 min-h-[320px]">
      <div className="flex items-center gap-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        {tag && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
            {tag}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground text-center max-w-xs">{description}</p>
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        {children}
      </div>
    </div>
  );
}

/* ── Variant 1: Breathing Logo ───────────────────────────────────── */
function BreathingLogo() {
  return (
    <>
      <svg
        width={64} height={64} viewBox="0 0 128 128" fill="none"
        style={{ animation: "clarity-breathe 2.4s ease-in-out infinite" }}
      >
        <rect width="128" height="128" rx="16" fill={BRAND_BLUE} />
        <path d={C_PATH} stroke="white" strokeWidth="14" strokeLinecap="round" fill="none" />
      </svg>
      <p className="text-lg font-semibold">Completing Verification</p>
      <p className="text-sm text-muted-foreground">Verifying...</p>
    </>
  );
}

/* ── Variant 2: Drawing C (stroke animation, looping) ────────────── */
function DrawingC() {
  return (
    <>
      <svg width={64} height={64} viewBox="0 0 128 128" fill="none">
        <rect width="128" height="128" rx="16" fill={BRAND_BLUE} />
        <path
          d={C_PATH}
          stroke="white" strokeWidth="14" strokeLinecap="round" fill="none"
          strokeDasharray="200"
          style={{ animation: "clarity-draw-loop 2s ease-in-out infinite" }}
        />
      </svg>
      <p className="text-lg font-semibold">Completing Verification</p>
      <p className="text-sm text-muted-foreground">Verifying...</p>
    </>
  );
}

/* ── Variant 3: Focus/Resolve (blur → sharp, looping) ────────────── */
function FocusResolve() {
  return (
    <>
      <svg
        width={64} height={64} viewBox="0 0 128 128" fill="none"
        style={{ animation: "clarity-focus-loop 2.5s ease-in-out infinite" }}
      >
        <rect width="128" height="128" rx="16" fill={BRAND_BLUE} />
        <path d={C_PATH} stroke="white" strokeWidth="14" strokeLinecap="round" fill="none" />
      </svg>
      <p className="text-lg font-semibold">Completing Verification</p>
      <p className="text-sm text-muted-foreground">Verifying...</p>
    </>
  );
}

/* ── Variant 4: Ripple + Logo ────────────────────────────────────── */
function RippleLogo() {
  return (
    <>
      <div className="relative" style={{ width: 64, height: 64 }}>
        {/* Ripple circles */}
        <svg
          width={128} height={128} viewBox="0 0 128 128" fill="none"
          className="absolute"
          style={{ top: -32, left: -32 }}
        >
          <circle cx="64" cy="64" r="20" stroke={BRAND_BLUE} strokeWidth="1.5" fill="none" opacity="0"
            style={{ animation: "clarity-ripple 2s ease-out infinite" }} />
          <circle cx="64" cy="64" r="20" stroke={BRAND_BLUE} strokeWidth="1.5" fill="none" opacity="0"
            style={{ animation: "clarity-ripple 2s ease-out infinite 0.7s" }} />
          <circle cx="64" cy="64" r="20" stroke={BRAND_BLUE} strokeWidth="1.5" fill="none" opacity="0"
            style={{ animation: "clarity-ripple 2s ease-out infinite 1.4s" }} />
        </svg>
        {/* Logo mark */}
        <svg width={64} height={64} viewBox="0 0 128 128" fill="none" className="relative z-10">
          <rect width="128" height="128" rx="16" fill={BRAND_BLUE} />
          <path d={C_PATH} stroke="white" strokeWidth="14" strokeLinecap="round" fill="none" />
        </svg>
      </div>
      <p className="text-lg font-semibold mt-4">Completing Verification</p>
      <p className="text-sm text-muted-foreground">Verifying...</p>
    </>
  );
}

/* ── Variant 5: Minimal pulse (just the mark, gentle) ────────────── */
function MinimalPulse() {
  return (
    <>
      <svg
        width={64} height={64} viewBox="0 0 128 128" fill="none"
        style={{ animation: "clarity-fade-scale 2s ease-in-out infinite" }}
      >
        <rect width="128" height="128" rx="16" fill={BRAND_BLUE} />
        <path d={C_PATH} stroke="white" strokeWidth="14" strokeLinecap="round" fill="none" />
      </svg>
      <p className="text-lg font-semibold">Completing Verification</p>
      <p className="text-sm text-muted-foreground">Verifying...</p>
    </>
  );
}

/* ── Variant 6: Drawing C once, then breathe (two-phase) ─────────── */
function DrawThenBreathe() {
  return (
    <>
      <svg
        width={64} height={64} viewBox="0 0 128 128" fill="none"
        style={{ animation: "clarity-breathe 2.4s ease-in-out infinite 1.2s" }}
      >
        <rect width="128" height="128" rx="16" fill={BRAND_BLUE} />
        <path
          d={C_PATH}
          stroke="white" strokeWidth="14" strokeLinecap="round" fill="none"
          strokeDasharray="200"
          style={{ animation: "clarity-draw 1.2s ease-out forwards" }}
        />
      </svg>
      <p className="text-lg font-semibold">Completing Verification</p>
      <p className="text-sm text-muted-foreground">Verifying...</p>
    </>
  );
}

/* ── Variant 7: Focus C only (rect stays sharp, C blurs/resolves) ── */
function FocusCOnly() {
  return (
    <>
      <svg width={64} height={64} viewBox="0 0 128 128" fill="none">
        <rect width="128" height="128" rx="16" fill={BRAND_BLUE} />
        <path
          d={C_PATH}
          stroke="white" strokeWidth="14" strokeLinecap="round" fill="none"
          style={{ animation: "clarity-c-focus 2.5s ease-in-out infinite" }}
        />
      </svg>
      <p className="text-lg font-semibold">Completing Verification</p>
      <p className="text-sm text-muted-foreground">Verifying...</p>
    </>
  );
}

/* ── Variant 8: Focus C once → settle into subtle breathe ─────────── */
function FocusThenBreathe() {
  return (
    <>
      <svg width={64} height={64} viewBox="0 0 128 128" fill="none">
        <rect width="128" height="128" rx="16" fill={BRAND_BLUE} />
        <path
          d={C_PATH}
          stroke="white" strokeWidth="14" strokeLinecap="round" fill="none"
          style={{ animation: "clarity-c-focus-once 1s ease-out forwards, clarity-c-breathe-subtle 2.4s ease-in-out infinite 1s" }}
        />
      </svg>
      <p className="text-lg font-semibold">Completing Verification</p>
      <p className="text-sm text-muted-foreground">Verifying...</p>
    </>
  );
}

/* ── Variant 9: Draw C → focus resolve (draw in blurry, then sharpen) */
function DrawThenFocus() {
  return (
    <>
      <svg width={64} height={64} viewBox="0 0 128 128" fill="none">
        <rect width="128" height="128" rx="16" fill={BRAND_BLUE} />
        <path
          d={C_PATH}
          stroke="white" strokeWidth="14" strokeLinecap="round" fill="none"
          strokeDasharray="200"
          style={{ animation: "clarity-draw-then-focus 2s ease-out forwards, clarity-c-breathe-subtle 2.4s ease-in-out infinite 2s" }}
        />
      </svg>
      <p className="text-lg font-semibold">Completing Verification</p>
      <p className="text-sm text-muted-foreground">Verifying...</p>
    </>
  );
}

/* ── Variant 10: Draw C once → breathe (refined two-phase) ────────── */
function DrawSettleBreathe() {
  return (
    <>
      <svg width={64} height={64} viewBox="0 0 128 128" fill="none">
        <rect width="128" height="128" rx="16" fill={BRAND_BLUE} />
        <path
          d={C_PATH}
          stroke="white" strokeWidth="14" strokeLinecap="round" fill="none"
          strokeDasharray="200"
          style={{ animation: "clarity-draw-settle 1.2s ease-out forwards, clarity-c-breathe-subtle 2.4s ease-in-out infinite 1.2s" }}
        />
      </svg>
      <p className="text-lg font-semibold">Completing Verification</p>
      <p className="text-sm text-muted-foreground">Verifying...</p>
    </>
  );
}

/* ── Variant 11: Current (for comparison) ────────────────────────── */
function CurrentSpinner() {
  return (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="64" height="64" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        className="text-blue-600 dark:text-blue-400 animate-spin"
      >
        <path d="M12 2v4" /><path d="M12 18v4" /><path d="M4.93 4.93l2.83 2.83" />
        <path d="M16.24 16.24l2.83 2.83" /><path d="M2 12h4" /><path d="M18 12h4" />
        <path d="M4.93 19.07l2.83-2.83" /><path d="M16.24 7.76l2.83-2.83" />
      </svg>
      <p className="text-lg font-semibold">Completing Verification</p>
      <p className="text-sm text-muted-foreground">Verifying...</p>
    </>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */
export function LoadingDemoPage() {
  return (
    <>
      <style>{keyframes}</style>
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold mb-2">Loading Animation Variants</h1>
          <p className="text-muted-foreground">Pick the one that best conveys "clarity" — calm, intentional, branded.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <DemoCard
            title="Current"
            description="Generic Lucide LoaderIcon with animate-spin. The baseline."
            tag="baseline"
          >
            <CurrentSpinner />
          </DemoCard>

          <DemoCard
            title="Breathing Logo"
            description="Brand mark gently scales and fades. Calm, confident, unhurried."
          >
            <BreathingLogo />
          </DemoCard>

          <DemoCard
            title="Drawing C"
            description="The C stroke draws and undraws. Evokes writing, intention, signing."
          >
            <DrawingC />
          </DemoCard>

          <DemoCard
            title="Focus / Resolve"
            description="Logo blurs and sharpens. Literally 'coming into clarity.'"
          >
            <FocusResolve />
          </DemoCard>

          <DemoCard
            title="Ripple"
            description="Concentric rings emanate from logo. Signal, broadcast, reach."
          >
            <RippleLogo />
          </DemoCard>

          <DemoCard
            title="Minimal Pulse"
            description="Softest option. Scale + opacity pulse. Almost static."
          >
            <MinimalPulse />
          </DemoCard>

          <DemoCard
            title="Draw → Breathe"
            description="C draws once on mount, then settles into gentle breathing. Two-phase."
          >
            <DrawThenBreathe />
          </DemoCard>
        </div>

        {/* Hybrids section */}
        <div className="mt-12 mb-6">
          <h2 className="text-2xl font-bold text-center mb-2">Hybrids</h2>
          <p className="text-muted-foreground text-center text-sm">Combining Focus/Resolve + Draw ideas. C animates inside a stable rectangle.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <DemoCard
            title="Focus C Only"
            description="Rectangle stays solid. Only the C letter blurs and resolves. Looping."
            tag="your idea"
          >
            <FocusCOnly />
          </DemoCard>

          <DemoCard
            title="Focus C → Breathe"
            description="C focuses once on mount, then settles into subtle opacity pulse."
            tag="recommended"
          >
            <FocusThenBreathe />
          </DemoCard>

          <DemoCard
            title="Draw → Focus"
            description="C draws in blurry, then sharpens. Combines writing + clarity metaphor."
          >
            <DrawThenFocus />
          </DemoCard>

          <DemoCard
            title="Draw → Settle → Breathe"
            description="C draws crisp, pauses, then gentle opacity breathe. Clean two-phase."
          >
            <DrawSettleBreathe />
          </DemoCard>
        </div>

        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>These would replace all full-page loading states (~12 instances).</p>
          <p>Inline button spinners (Loader2 w-4 h-4) stay as-is — they're standard UX.</p>
        </div>
      </div>
    </>
  );
}
