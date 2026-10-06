import { useId } from "react";
import { GLOW_REACH, mistBox, projectPair, type SceneTarget } from "./sceneState";

/**
 * The still picture for browsers without WebGL. It draws the same projected discs as the
 * live renderer (sceneState.projectPair), in the same order, with the same states: the
 * glow, the mist in the gap, the two glossy bodies, the filament. Transparent background.
 * Nothing in it moves.
 */
export function Still({ target, width, height }: { target: SceneTarget; width: number; height: number }) {
  const uid = useId().replace(/:/g, "");
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const [back, front] = projectPair(target.view, target.turn, w, h);
  const mist = mistBox(back, front);
  const bodyOpacity = 1 - target.dim;
  const angle = mist ? (Math.atan2(mist.dir[1], mist.dir[0]) * 180) / Math.PI : 0;

  return (
    <svg
      data-testid="first-still"
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${w} ${h}`}
    >
      <defs>
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
        <radialGradient id={`${uid}-glow`}>
          <stop offset={`${(100 / GLOW_REACH).toFixed(1)}%`} stopColor="#4d7dff" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#4d7dff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-mist`}>
          <stop offset="35%" stopColor="#8fa9d6" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#8fa9d6" stopOpacity="0" />
        </radialGradient>
      </defs>
      {[back, front].map((d) => (
        <circle key={`glow-${d.id}`} cx={d.x} cy={d.y} r={d.r * GLOW_REACH} fill={`url(#${uid}-glow)`} opacity={bodyOpacity} />
      ))}
      {mist && target.mist > 0 && (
        <ellipse
          cx={mist.cx}
          cy={mist.cy}
          rx={mist.halfLength}
          ry={mist.halfHeight}
          transform={`rotate(${angle} ${mist.cx} ${mist.cy})`}
          fill={`url(#${uid}-mist)`}
          opacity={target.mist}
        />
      )}
      <g opacity={bodyOpacity}>
        {[back, front].map((d) => (
          <circle key={d.id} data-body={d.id} cx={d.x} cy={d.y} r={d.r} fill={`url(#${uid}-${d.id})`} />
        ))}
      </g>
      {mist && target.filament > 0 && (
        <line
          data-filament
          x1={mist.gap.from[0]}
          y1={mist.gap.from[1]}
          x2={mist.gap.to[0]}
          y2={mist.gap.to[1]}
          stroke="#ffffff"
          strokeWidth={1.5}
          opacity={target.filament}
        />
      )}
    </svg>
  );
}
