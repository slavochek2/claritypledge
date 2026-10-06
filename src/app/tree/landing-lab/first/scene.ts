/**
 * WebGL renderer for the "Go first" scene.
 *
 * It started as a copy of the Wild prototype's raymarcher (../wild/scene.ts, left
 * untouched). Review asked for perfect circles, one glossy crescent-lit material matching
 * the still, a transparent background, mist in the gap only, and a filament after a high
 * rating. A raymarched sphere under perspective is not a perfect circle, and its look can
 * only approximate the still. So this renderer draws the same projected discs the still
 * draws (sceneState.projectPair), shaded in the fragment shader with the still's own
 * gradient stops. Same geometry, same states, one source of truth.
 *
 * Layers, back to front, composited in premultiplied alpha over a transparent canvas:
 * each body's glow, the mist in the gap, the back body, the front body, the filament.
 *
 * A change eases over 600 ms and the loop stops. Nothing moves after settling, and
 * `finish()` jumps to the end of a change at once.
 */
import { GLOW_REACH, mistBox, projectPair, type SceneTarget } from "./sceneState";

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;

uniform vec2 uRes;      // canvas size in device px
uniform vec3 uBack;     // x, y (px, top-left origin), r
uniform vec3 uFront;
uniform float uBackIsA; // 1 when the back body is body A
uniform float uDim;
uniform float uMist;
uniform vec4 uMistBox;  // centre x, centre y, half length, half height (px)
uniform vec2 uMistDir;  // unit vector along the gap
uniform float uFilament;
uniform vec4 uGap;      // from.xy, to.xy (px)
uniform float uPx;      // device px per CSS px

// The still's gradient stops (Still.tsx), per body.
const vec3 A0 = vec3(0.435, 0.608, 1.000); // #6f9bff
const vec3 A1 = vec3(0.145, 0.322, 0.788); // #2552c9
const vec3 A2 = vec3(0.110, 0.247, 0.612); // #1c3f9c
const vec3 A3 = vec3(0.737, 0.827, 1.000); // #bcd3ff
const vec3 B0 = vec3(0.788, 0.863, 1.000); // #c9dcff
const vec3 B1 = vec3(0.494, 0.635, 0.847); // #7ea2d8
const vec3 B2 = vec3(0.302, 0.427, 0.624); // #4d6d9f
const vec3 B3 = vec3(0.933, 0.957, 1.000); // #eef4ff
const vec3 GLOW = vec3(0.302, 0.490, 1.000); // #4d7dff
const vec3 MIST = vec3(0.561, 0.663, 0.839); // #8fa9d6

vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }

vec3 ramp(float t, vec3 c0, vec3 c1, vec3 c2, vec3 c3) {
  if (t < 0.55) return mix(c0, c1, t / 0.55);
  if (t < 0.88) return mix(c1, c2, (t - 0.55) / 0.33);
  return mix(c2, c3, clamp((t - 0.88) / 0.12, 0.0, 1.0));
}

// A glossy body: the still's radial gradient, centred up and to the left of the disc
// centre, so a bright crescent forms at the far rim. Anti-aliased edge.
vec4 body(vec2 p, vec3 d, float isA) {
  vec2 q = (p - d.xy) / d.z;
  float edge = length(p - d.xy) - d.z;
  float cover = 1.0 - smoothstep(-uPx, uPx, edge);
  float t = length(q - vec2(-0.16, -0.24)) / 1.24;
  vec3 c = isA > 0.5 ? ramp(t, A0, A1, A2, A3) : ramp(t, B0, B1, B2, B3);
  c *= 1.0 - uDim;
  return vec4(c * cover, cover);
}

vec4 glow(vec2 p, vec3 d) {
  float x = (length(p - d.xy) - d.z) / (d.z * (${GLOW_REACH.toFixed(2)} - 1.0));
  float a = 0.45 * (1.0 - uDim) * pow(1.0 - smoothstep(0.0, 1.0, x), 2.0);
  return vec4(GLOW * a, a);
}

void main() {
  // Top-left origin, device px, to match the still's coordinates.
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec4 col = vec4(0.0);

  col = over(glow(p, uBack), col);
  col = over(glow(p, uFront), col);

  if (uMist > 0.0 && uMistBox.z > 0.0) {
    vec2 rel = p - uMistBox.xy;
    vec2 local = vec2(dot(rel, uMistDir), dot(rel, vec2(-uMistDir.y, uMistDir.x)));
    float e = length(local / uMistBox.zw);
    float a = 0.85 * uMist * pow(1.0 - smoothstep(0.35, 1.0, e), 1.5);
    col = over(vec4(MIST * a, a), col);
  }

  col = over(body(p, uBack, uBackIsA), col);
  col = over(body(p, uFront, 1.0 - uBackIsA), col);

  if (uFilament > 0.0) {
    vec2 a = uGap.xy;
    vec2 b = uGap.zw;
    vec2 ba = b - a;
    float h = clamp(dot(p - a, ba) / max(dot(ba, ba), 1.0), 0.0, 1.0);
    float dist = length(p - a - ba * h);
    float line = uFilament * (1.0 - smoothstep(0.5 * uPx, 1.5 * uPx, dist));
    col = over(vec4(vec3(line), line), col);
  }

  gl_FragColor = col;
}
`;

export interface FirstScene {
  /** Eases toward the target over TRANSITION_MS, or jumps there when motion is off. */
  setTarget(target: SceneTarget): void;
  /** Ends a change in progress at once, on its final picture. */
  finish(): void;
  destroy(): void;
}

interface Options {
  /** false for prefers-reduced-motion: every change is a single still frame. */
  animate: boolean;
  onUnavailable: () => void;
  onAvailable: () => void;
}

type Gl = WebGLRenderingContext | WebGL2RenderingContext;

export const TRANSITION_MS = 600;

interface Program {
  program: WebGLProgram;
  buffer: WebGLBuffer;
  loc: Record<string, WebGLUniformLocation | null>;
}

const UNIFORMS = [
  "uRes", "uBack", "uFront", "uBackIsA", "uDim", "uMist", "uMistBox", "uMistDir", "uFilament", "uGap", "uPx",
] as const;

function compile(gl: Gl, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    console.error("[landing-first] shader compile failed:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function buildProgram(gl: Gl): Program | null {
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.bindAttribLocation(program, 0, "aPos");
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    console.error("[landing-first] program link failed:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  const buffer = gl.createBuffer();
  if (!buffer) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc: Record<string, WebGLUniformLocation | null> = {};
  for (const name of UNIFORMS) loc[name] = gl.getUniformLocation(program, name);
  return { program, buffer, loc };
}

type Pose = Omit<SceneTarget, "view"> & { view: number };

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const blend = (p: Pose, q: Pose, k: number): Pose => ({
  view: lerp(p.view, q.view, k),
  mist: lerp(p.mist, q.mist, k),
  dim: lerp(p.dim, q.dim, k),
  filament: lerp(p.filament, q.filament, k),
  turn: lerp(p.turn, q.turn, k),
});

/** Returns null when no WebGL context can be created or the shader does not build. */
export function createFirstScene(canvas: HTMLCanvasElement, opts: Options): FirstScene | null {
  const attrs: WebGLContextAttributes = {
    antialias: false,
    alpha: true,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: "low-power",
  };
  const gl: Gl | null =
    (canvas.getContext("webgl2", attrs) as WebGL2RenderingContext | null) ??
    (canvas.getContext("webgl", attrs) as WebGLRenderingContext | null);
  if (!gl) return null;

  let prog = buildProgram(gl);
  if (!prog) return null;

  let from: Pose = { view: 0, mist: 0, dim: 0, filament: 0, turn: 0 };
  let to: Pose = from;
  let shown: Pose = from;
  let start = 0;
  let raf = 0;
  let lost = false;
  let destroyed = false;
  let placed = false;

  const scale = () => Math.min(window.devicePixelRatio || 1, 2);

  const resize = () => {
    const s = scale();
    const w = Math.max(1, Math.round(canvas.clientWidth * s));
    const h = Math.max(1, Math.round(canvas.clientHeight * s));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  const draw = () => {
    if (!prog || lost || destroyed) return;
    resize();
    const w = canvas.width;
    const h = canvas.height;
    const [back, front] = projectPair(shown.view, shown.turn, w, h);
    const mist = mistBox(back, front);
    const L = prog.loc;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, prog.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(L.uRes ?? null, w, h);
    gl.uniform3f(L.uBack ?? null, back.x, back.y, back.r);
    gl.uniform3f(L.uFront ?? null, front.x, front.y, front.r);
    gl.uniform1f(L.uBackIsA ?? null, back.id === "a" ? 1 : 0);
    gl.uniform1f(L.uDim ?? null, shown.dim);
    gl.uniform1f(L.uMist ?? null, mist ? shown.mist : 0);
    gl.uniform4f(L.uMistBox ?? null, mist?.cx ?? 0, mist?.cy ?? 0, mist?.halfLength ?? 0, mist?.halfHeight ?? 1);
    gl.uniform2f(L.uMistDir ?? null, mist?.dir[0] ?? 1, mist?.dir[1] ?? 0);
    gl.uniform1f(L.uFilament ?? null, mist ? shown.filament : 0);
    gl.uniform4f(
      L.uGap ?? null,
      mist?.gap.from[0] ?? 0,
      mist?.gap.from[1] ?? 0,
      mist?.gap.to[0] ?? 0,
      mist?.gap.to[1] ?? 0,
    );
    gl.uniform1f(L.uPx ?? null, scale());
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const frame = (now: number) => {
    raf = 0;
    if (lost || destroyed) return;
    if (!start) start = now;
    const k = Math.min(1, (now - start) / TRANSITION_MS);
    shown = blend(from, to, ease(k));
    draw();
    if (k < 1) raf = requestAnimationFrame(frame);
  };

  const jump = () => {
    stop();
    shown = to;
    draw();
  };

  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    stop();
    prog = null;
    opts.onUnavailable();
  };
  const onRestored = () => {
    lost = false;
    prog = buildProgram(gl);
    if (!prog) return;
    opts.onAvailable();
    jump();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  const ro = new ResizeObserver(() => {
    if (!raf) draw();
  });
  ro.observe(canvas);

  const same = (p: Pose, q: Pose) =>
    p.view === q.view && p.mist === q.mist && p.dim === q.dim && p.filament === q.filament && p.turn === q.turn;

  return {
    setTarget(target) {
      const next: Pose = { ...target };
      if (!placed) {
        placed = true;
        to = next;
        jump();
        return;
      }
      if (same(next, to)) {
        if (!raf) draw();
        return;
      }
      to = next;
      if (!opts.animate) {
        jump();
        return;
      }
      from = shown;
      start = 0;
      stop();
      raf = requestAnimationFrame(frame);
    },
    finish() {
      if (raf) jump();
    },
    destroy() {
      destroyed = true;
      stop();
      ro.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (prog && !gl.isContextLost()) {
        gl.deleteBuffer(prog.buffer);
        gl.deleteProgram(prog.program);
      }
      prog = null;
    },
  };
}
