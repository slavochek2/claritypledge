import { useId } from "react";
import { sceneState, screenAxis, viewAngle } from "./state";

/**
 * Static version of the scene for browsers without WebGL. It projects the same
 * geometry through the same camera the shader uses, so every state the control can
 * reach looks like a still of the live scene rather than a different picture.
 */
const CAMERA_Z = 6.5;
const RADIUS = 0.62;

export function WildFallback({ value, width, height }: { value: number; width: number; height: number }) {
  const uid = useId().replace(/:/g, "");
  const s = sceneState(value);
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const aspect = w / h;
  const portrait = aspect < 1;
  const zoom = portrait ? 1.75 : 1.9;
  const shift = (portrait ? 0.16 : 0.03) * Math.min(w, h);
  const unit = Math.min(w, h);
  const [ax, ay] = screenAxis(aspect);
  const th = viewAngle(s.reveal);
  const half = s.separation / 2;
  const u = [Math.sin(th) * ax, Math.sin(th) * ay, Math.cos(th)] as const;

  const project = (x: number, y: number, z: number) => {
    const k = zoom / (CAMERA_Z - z);
    return { x: w / 2 + x * k * unit, y: h / 2 - shift - y * k * unit, k };
  };
  const a = project(-u[0] * half, -u[1] * half, -u[2] * half);
  const b = project(u[0] * half, u[1] * half, u[2] * half);
  const bodies = [
    { key: "a", p: a, r: RADIUS * a.k * unit, z: -u[2], grad: `${uid}-a` },
    { key: "b", p: b, r: RADIUS * 0.94 * b.k * unit, z: u[2], grad: `${uid}-b` },
  ].sort((m, n) => m.z - n.z);

  const fog = 1 - s.reveal;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ra = RADIUS * a.k * unit;
  const rb = RADIUS * 0.94 * b.k * unit;
  const sA = { x: a.x + (dx / len) * ra, y: a.y + (dy / len) * ra };
  const sB = { x: b.x - (dx / len) * rb, y: b.y - (dy / len) * rb };
  const gapVisible = len > ra + rb;
  const pulse = { x: sA.x + (sB.x - sA.x) * s.pulsePos, y: sA.y + (sB.y - sA.y) * s.pulsePos };
  const link = s.done ? "#7dfcb0" : "#a8ccff";

  return (
    <svg
      data-testid="wild-fallback"
      aria-hidden="true"
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id={`${uid}-bg`} cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="#0a1426" />
          <stop offset="100%" stopColor="#020409" />
        </radialGradient>
        <radialGradient id={`${uid}-a`} cx="42%" cy="38%" r="62%">
          <stop offset="0%" stopColor="#6f9bff" />
          <stop offset="55%" stopColor="#2552c9" />
          <stop offset="88%" stopColor="#1c3f9c" />
          <stop offset="100%" stopColor="#bcd3ff" />
        </radialGradient>
        <radialGradient id={`${uid}-b`} cx="42%" cy="38%" r="62%">
          <stop offset="0%" stopColor="#c9dcff" />
          <stop offset="55%" stopColor="#7ea2d8" />
          <stop offset="88%" stopColor="#4d6d9f" />
          <stop offset="100%" stopColor="#eef4ff" />
        </radialGradient>
        <radialGradient id={`${uid}-halo`}>
          <stop offset="0%" stopColor="#4d7dff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#4d7dff" stopOpacity="0" />
        </radialGradient>
        {/* Fog is light, not dark: a pale veil that glows where the bodies are, so the
            resting state reads as two bodies lost in mist rather than a smudged image. */}
        <radialGradient id={`${uid}-fog`}>
          <stop offset="0%" stopColor="#b9d2ff" stopOpacity="0.55" />
          <stop offset="45%" stopColor="#7c9fdc" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#3b5a92" stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}-blur`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation={1 + 5 * fog} />
        </filter>
        <filter id={`${uid}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      <rect width={w} height={h} fill={`url(#${uid}-bg)`} />
      {[a, b].map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={RADIUS * p.k * unit * (1.8 + 1.6 * fog)}
          fill={`url(#${uid}-halo)`}
          opacity={0.5 + 0.5 * fog}
        />
      ))}
      <g filter={fog > 0.05 ? `url(#${uid}-blur)` : undefined}>
        {bodies.map((m) => (
          <circle key={m.key} cx={m.p.x} cy={m.p.y} r={m.r} fill={`url(#${m.grad})`} />
        ))}
      </g>
      <ellipse
        cx={(a.x + b.x) / 2}
        cy={(a.y + b.y) / 2}
        rx={unit * 0.62}
        ry={unit * 0.52}
        fill={`url(#${uid}-fog)`}
        opacity={fog}
      />
      {s.bridge > 0 && gapVisible && (
        <g filter={`url(#${uid}-glow)`}>
          <line x1={sA.x} y1={sA.y} x2={sB.x} y2={sB.y} stroke={link} strokeWidth={2} opacity={0.3 + 0.6 * s.bridge} />
        </g>
      )}
      {s.pulseAmp > 0 && gapVisible && (
        <>
          <circle cx={pulse.x} cy={pulse.y} r={14} fill={link} opacity={0.35 * s.pulseAmp} filter={`url(#${uid}-glow)`} />
          <circle cx={pulse.x} cy={pulse.y} r={4} fill="#ffffff" opacity={s.pulseAmp} />
        </>
      )}
    </svg>
  );
}
