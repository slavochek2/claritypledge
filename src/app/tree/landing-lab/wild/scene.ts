/**
 * Raw WebGL renderer for the "two minds" scene. No 3D library: one full-screen
 * triangle and a raymarched fragment shader over signed distance fields.
 *
 * The shaders are GLSL ES 1.00, which both WebGL2 and WebGL1 contexts accept, so the
 * WebGL1 fallback is the same program on an older context.
 */
import { sceneState, screenAxis, viewAngle } from "./state";

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uRes;
uniform float uTime;
uniform float uReveal;
uniform vec3 uA;
uniform vec3 uB;
uniform float uRadius;
uniform vec3 uPulse;   // x: position along the gap, y: brightness, z: link strength
uniform float uDone;
uniform vec2 uParallax;
uniform float uZoom;
uniform vec2 uShift;

const vec3 TINT_A = vec3(0.14, 0.36, 1.00);
const vec3 TINT_B = vec3(0.38, 0.68, 1.00);
const vec3 FOG = vec3(0.045, 0.085, 0.19);
const vec3 LINK = vec3(0.62, 0.80, 1.00);
const vec3 LINK_DONE = vec3(0.40, 1.00, 0.66);

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

float wobble(vec3 q, float seed) {
  return 0.028 * sin(q.x * 4.0 + uTime * 0.8 + seed)
               * sin(q.y * 3.7 - uTime * 0.6 + seed * 1.7)
               * sin(q.z * 4.3 + uTime * 0.7 + seed * 0.5);
}
float sdA(vec3 p) { vec3 q = p - uA; return length(q) - uRadius + wobble(q, 0.0); }
float sdB(vec3 p) { vec3 q = p - uB; return length(q) - uRadius * 0.94 + wobble(q, 2.3); }
float mapD(vec3 p) { return min(sdA(p), sdB(p)); }

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(0.0015, -0.0015);
  return normalize(e.xyy * mapD(p + e.xyy) + e.yyx * mapD(p + e.yyx) +
                   e.yxy * mapD(p + e.yxy) + e.xxx * mapD(p + e.xxx));
}

vec3 shade(vec3 p, vec3 rd, float t, float id, vec3 fogBase, float fogAmt) {
  vec3 n = calcNormal(p);
  bool isA = id < 0.5;
  vec3 tint = isA ? TINT_A : TINT_B;
  vec3 c = isA ? uA : uB;
  vec3 other = isA ? uB : uA;

  vec3 key = normalize(vec3(-0.55, 0.75, 0.6));
  float facing = max(dot(n, -rd), 0.0);
  float dif = max(dot(n, key), 0.0);
  float spec = pow(max(dot(reflect(rd, n), key), 0.0), 48.0);

  // Light each mind receives from the other: soft, wrapped, stronger as the link grows.
  vec3 lo = other - p;
  float dOther = length(lo);
  float wrap = max((dot(n, lo / dOther) + 0.35) / 1.35, 0.0);
  float mutual = wrap * wrap * (0.15 + 0.7 * uPulse.z) / (dOther * dOther);

  // Slow currents over the surface, so each body reads as alive rather than as a ball.
  vec3 local = normalize(p - c);
  float flow = fbm(local.xy * 2.6 + local.z + vec2(uTime * 0.07, -uTime * 0.05) + (isA ? 0.0 : 5.0));

  // Light seems to come from inside: brightest straight through, a thin rim at the edge.
  float rim = pow(1.0 - facing, 4.0);
  vec3 surf = tint * 0.015
            + tint * pow(facing, 1.6) * (0.25 + 1.1 * flow * flow) * 0.9
            + tint * dif * 0.10
            + mix(tint, vec3(1.0), 0.55) * rim * 1.3
            + vec3(0.85, 0.93, 1.0) * spec * 0.35
            + LINK * mutual;

  // Through fog the surface all but disappears: a glow brightest at the centre that melts
  // into the air around it at the edge, so there is no outline to see.
  float fogMix = 1.0 - exp(-max(t - 2.0, 0.0) * 1.3 * fogAmt);
  vec3 fogLit = fogBase + tint * 0.42 * pow(facing, 1.4);
  return mix(surf, fogLit, fogMix * 0.96);
}

// Closest approach of the ray to a point: returns the distance, writes the ray parameter.
float rayPoint(vec3 ro, vec3 rd, vec3 c, out float t) {
  t = dot(c - ro, rd);
  return length(ro + rd * max(t, 0.0) - c);
}

// Closest approach of the ray to a segment: distance, ray parameter, segment parameter.
float raySeg(vec3 ro, vec3 rd, vec3 a, vec3 b, out float t, out float s) {
  vec3 ba = b - a;
  vec3 oa = ro - a;
  float d = dot(rd, ba);
  float bb = dot(ba, ba);
  float ob = dot(oa, ba);
  float od = dot(oa, rd);
  s = clamp((ob - od * d) / max(bb - d * d, 1e-4), 0.0, 1.0);
  t = max(s * d - od, 0.0);
  return length(ro + rd * t - (a + ba * s));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y) - uShift;

  vec3 ro = vec3(uParallax * vec2(0.55, 0.35), 6.5);
  vec3 ww = normalize(-ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + uZoom * ww);

  float fogAmt = 1.0 - uReveal;
  float t = 0.0;
  float hitId = -1.0;
  // Closest near-miss, used to anti-alias the silhouette from the outside.
  float minR = 1e9;
  float tMin = 0.0;
  float idMin = 0.0;
  for (int i = 0; i < 64; i++) {
    vec3 p = ro + rd * t;
    float a = sdA(p);
    float b = sdB(p);
    float d = min(a, b);
    if (d < 0.001 * t) { hitId = a < b ? 0.0 : 1.0; break; }
    float r = d / max(t, 0.1);
    if (r < minR) { minR = r; tMin = t; idMin = a < b ? 0.0 : 1.0; }
    t += d * 0.9;
    if (t > 12.0) break;
  }
  // Grazing rays can run out of steps a hair from the surface: they are hits, not misses,
  // or they skip the occlusion below and draw a bright ring around each silhouette.
  if (hitId < 0.0 && minR < 0.0015) { hitId = idMin; t = tMin; }
  float tHit = hitId < 0.0 ? 1e4 : t;

  // Background: near-black with drifting fog, lit by the two bodies.
  vec2 q = uv * 1.4;
  float drift = uTime * 0.025;
  float wisp = fbm(q + vec2(drift, -drift * 0.6) + 0.6 * fbm(q * 1.7 - drift));
  vec3 col = vec3(0.004, 0.007, 0.016) + vec3(0.010, 0.020, 0.045) * (1.0 - length(uv) * 0.7);

  // Soft light around each body, wide in fog, tight in clear air.
  float tcA, tcB;
  float dcA = rayPoint(ro, rd, uA, tcA);
  float dcB = rayPoint(ro, rd, uB, tcB);
  float haloK = mix(2.6, 7.5, uReveal);
  float hA = exp(-max(dcA - uRadius, 0.0) * haloK);
  float hB = exp(-max(dcB - uRadius, 0.0) * haloK);
  // A body hides the other one's glow, never its own (that drew a bright ring at its edge).
  // In fog, light scatters around a body, so the hiding fades out as the fog thickens.
  float hide = mix(1.0, 0.25, uReveal);
  if (hitId > 0.5 && tcA > tHit) hA *= hide;
  if (hitId >= 0.0 && hitId < 0.5 && tcB > tHit) hB *= hide;
  float halo = hA + hB;

  col += FOG * wisp * (0.25 + 0.7 * fogAmt) * (0.12 + 1.1 * halo);

  if (hitId >= 0.0) {
    col = shade(ro + rd * t, rd, t, hitId, col, fogAmt);
  } else {
    float pix = 1.0 / (min(uRes.x, uRes.y) * uZoom);
    // A wide falloff (about 2.5 render pixels) so the edge stays smooth even when the
    // adaptive scaler lowers the resolution.
    float cover = 1.0 - smoothstep(0.0, 2.5 * pix, minR);
    if (cover > 0.0) col = mix(col, shade(ro + rd * tMin, rd, tMin, idMin, col, fogAmt), cover);
  }

  col += (TINT_A * hA + TINT_B * hB) * mix(0.24, 0.1, uReveal);

  // The link: a thread across the gap, and a pulse travelling along it.
  vec3 dir = normalize(uB - uA);
  vec3 sA = uA + dir * uRadius;
  vec3 sB = uB - dir * uRadius * 0.94;
  vec3 linkCol = mix(LINK, LINK_DONE, uDone * 0.7);
  if (uPulse.z > 0.0) {
    float tl, sl;
    float dl = raySeg(ro, rd, sA, sB, tl, sl);
    if (tl < tHit) {
      float shimmer = 1.0 - (0.35 - 0.25 * uDone) * (0.5 + 0.5 * sin(sl * 26.0 - uTime * 3.0));
      float thread = 0.0016 / (dl * dl + 0.0009);
      col += linkCol * thread * uPulse.z * shimmer * 0.35;
    }
  }
  if (uPulse.y > 0.0) {
    vec3 pp = mix(sA, sB, uPulse.x);
    float tp;
    float dp = rayPoint(ro, rd, pp, tp);
    if (tp < tHit + 0.05) {
      col += linkCol * uPulse.y * (0.010 / (dp * dp + 0.0012) + 0.4 * exp(-dp * 6.0));
    }
  }

  // Tone map, gamma, vignette, dither against banding in the dark gradients.
  col = 1.0 - exp(-col * 1.35);
  col = pow(col, vec3(0.4545));
  col *= 1.0 - 0.35 * smoothstep(0.55, 1.25, length(uv));
  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface WildScene {
  /** The control value, 0..1. The scene eases toward it unless motion is reduced. */
  setValue(value: number): void;
  /** Pointer or tilt offset, each axis -1..1. */
  setParallax(x: number, y: number): void;
  /** Whether the scene may draw (tab visible and canvas on screen). */
  setActive(active: boolean): void;
  destroy(): void;
}

interface Options {
  /** false for prefers-reduced-motion: no loop, one frame per change, no idle motion. */
  animate: boolean;
  /** Context lost with no restore yet, or the program failed: show the static version. */
  onUnavailable: () => void;
  /** Context restored and the program rebuilt. */
  onAvailable: () => void;
}

type Gl = WebGLRenderingContext | WebGL2RenderingContext;

/**
 * Lowest render scale, in render pixels per CSS pixel. Below 1 the canvas is stretched
 * and the sphere silhouettes visibly stair-step, so slow devices get a lower frame rate
 * rather than a blocky picture.
 */
const MIN_SCALE = 1;

interface Program {
  program: WebGLProgram;
  buffer: WebGLBuffer;
  loc: Record<string, WebGLUniformLocation | null>;
}

const UNIFORMS = [
  "uRes", "uTime", "uReveal", "uA", "uB", "uRadius", "uPulse", "uDone", "uParallax", "uZoom", "uShift",
] as const;

function compile(gl: Gl, type: number, src: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    console.error("[wild] shader compile failed:", gl.getShaderInfoLog(shader));
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
    console.error("[wild] program link failed:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  const buffer = gl.createBuffer();
  if (!buffer) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  // One triangle that covers the viewport.
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc: Record<string, WebGLUniformLocation | null> = {};
  for (const name of UNIFORMS) loc[name] = gl.getUniformLocation(program, name);
  return { program, buffer, loc };
}

/** Returns null when no WebGL context can be created or the shader does not build. */
export function createWildScene(canvas: HTMLCanvasElement, opts: Options): WildScene | null {
  const attrs: WebGLContextAttributes = {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  };
  const gl: Gl | null =
    (canvas.getContext("webgl2", attrs) as WebGL2RenderingContext | null) ??
    (canvas.getContext("webgl", attrs) as WebGLRenderingContext | null);
  if (!gl) return null;

  let prog = buildProgram(gl);
  if (!prog) return null;

  let target = 0;
  let shown = 0;
  let parX = 0;
  let parY = 0;
  let parTX = 0;
  let parTY = 0;
  let active = false;
  let lost = false;
  let destroyed = false;
  let raf = 0;
  let clock = 0;
  let last = 0;

  const small = () => canvas.clientWidth < 640;
  const maxScale = () => Math.max(MIN_SCALE, Math.min(window.devicePixelRatio || 1, small() ? 1.5 : 2));
  let scale = maxScale();
  let slowFrames = 0;
  let fastFrames = 0;

  const resize = () => {
    const w = Math.max(1, Math.round(canvas.clientWidth * scale));
    const h = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  const draw = () => {
    if (!prog || lost || destroyed) return;
    resize();
    const s = sceneState(shown);
    const w = canvas.width;
    const h = canvas.height;
    const aspect = w / h;
    const [ax, ay] = screenAxis(aspect);
    const idle = opts.animate ? 0.05 * Math.sin(clock * 0.31) : 0;
    const th = viewAngle(s.reveal) + idle;
    // Pair axis in world space: toward the viewer at rest, across the screen revealed.
    const ux = Math.sin(th) * ax;
    const uy = Math.sin(th) * ay;
    const uz = Math.cos(th);
    const half = s.separation / 2;
    const bob = opts.animate ? 0.06 : 0;
    const portrait = aspect < 1;

    gl.viewport(0, 0, w, h);
    gl.useProgram(prog.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, prog.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const L = prog.loc;
    gl.uniform2f(L.uRes ?? null, w, h);
    gl.uniform1f(L.uTime ?? null, opts.animate ? clock : 7.0);
    gl.uniform1f(L.uReveal ?? null, s.reveal);
    gl.uniform3f(L.uA ?? null, -ux * half, -uy * half + bob * Math.sin(clock * 0.7), -uz * half);
    gl.uniform3f(L.uB ?? null, ux * half, uy * half + bob * Math.sin(clock * 0.7 + 2.1), uz * half);
    gl.uniform1f(L.uRadius ?? null, 0.62);
    gl.uniform3f(L.uPulse ?? null, s.pulsePos, s.pulseAmp, s.bridge);
    gl.uniform1f(L.uDone ?? null, s.done);
    gl.uniform2f(L.uParallax ?? null, parX, parY);
    gl.uniform1f(L.uZoom ?? null, portrait ? 1.75 : 1.9);
    gl.uniform2f(L.uShift ?? null, 0, portrait ? 0.16 : 0.03);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const frame = (now: number) => {
    raf = 0;
    if (!active || lost || destroyed) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    clock += dt;
    const k = 1 - Math.exp(-dt * 5);
    shown += (target - shown) * k;
    if (Math.abs(target - shown) < 1e-4) shown = target;
    parX += (parTX - parX) * (1 - Math.exp(-dt * 3));
    parY += (parTY - parY) * (1 - Math.exp(-dt * 3));
    draw();

    // Keep the frame rate up on slow devices by rendering fewer pixels.
    if (dt > 0.03) {
      slowFrames++;
      fastFrames = 0;
    } else {
      fastFrames++;
      slowFrames = 0;
    }
    if (slowFrames > 20 && scale > MIN_SCALE) {
      scale = Math.max(MIN_SCALE, scale * 0.85);
      slowFrames = 0;
    } else if (fastFrames > 180 && scale < maxScale()) {
      scale = Math.min(maxScale(), scale * 1.15);
      fastFrames = 0;
    }
    raf = requestAnimationFrame(frame);
  };

  const kick = () => {
    if (destroyed || lost) return;
    if (!opts.animate) {
      shown = target;
      draw();
      return;
    }
    if (active && !raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    }
  };

  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    prog = null;
    opts.onUnavailable();
  };
  const onRestored = () => {
    lost = false;
    prog = buildProgram(gl);
    if (!prog) return;
    opts.onAvailable();
    kick();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  const ro = new ResizeObserver(() => {
    scale = Math.min(scale, maxScale());
    if (!opts.animate) draw();
  });
  ro.observe(canvas);

  return {
    setValue(value) {
      target = value;
      kick();
    },
    setParallax(x, y) {
      if (!opts.animate) return;
      parTX = x;
      parTY = y;
    },
    setActive(next) {
      active = next;
      if (!next && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      kick();
    },
    destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
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
