// Deterministic scene renderer — the "frame-stepping" technique (no engine install).
//
// WHY: kiss-capture.mjs uses Playwright `recordVideo`, which captures in WALL-CLOCK
// time — under load it drops/dupes frames, so the same scene renders differently each
// run. For authored explainer scenes (calibration gauge, week timeline) we want
// byte-reproducible output. So instead of recording, we DRIVE the animation ourselves:
// the scene exposes `window.__hf = { duration, seek(t) }`; we seek to t = i/fps, settle,
// screenshot, advance. Every frame is a deterministic function of t — reproducible.
//
// This is HyperFrames' core idea reimplemented on the Playwright + ffmpeg the pipeline
// already has — no `hyperframes` npm package, no GSAP, no new dependency.
//
// Usage:
//   node scripts/video/frame-render.mjs <scene.html> [outDir] [--fps 30] [--no-video]
// Output: <outDir>/frames/frame-00001.png ... and (unless --no-video) <outDir>/scene.mp4
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function flag(name, def) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def; }
const hasFlag = (name) => process.argv.includes(name);

const scenePath = resolve(process.argv[2] || '');
if (!process.argv[2]) {
  console.error('Usage: node scripts/video/frame-render.mjs <scene.html> [outDir] [--fps 30] [--no-video]');
  process.exit(1);
}
const outDir = resolve(process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'tmp/video-scene');
const fps = Number(flag('--fps', '30'));
const makeVideo = !hasFlag('--no-video');
const WIDTH = 1920, HEIGHT = 1080;

const framesDir = resolve(outDir, 'frames');
rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const browser = await chromium.launch({
  // deterministic compositor: disable GPU rasterization variance, fix scale factor.
  args: ['--force-device-scale-factor=1', '--hide-scrollbars', '--disable-gpu'],
});
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
  // pin animations to OUR clock — page time never advances on its own.
  reducedMotion: 'no-preference',
});
const page = await context.newPage();

console.log(`[render] loading ${scenePath}`);
await page.goto(pathToFileURL(scenePath).href, { waitUntil: 'load' });

// The scene must expose the seek contract before we can step it.
await page.waitForFunction(
  () => typeof window.__hf === 'object' && typeof window.__hf.seek === 'function' && Number(window.__hf.duration) > 0,
  { timeout: 10_000 }
);
const duration = await page.evaluate(() => window.__hf.duration);
const totalFrames = Math.max(1, Math.round(duration * fps));
console.log(`[render] duration=${duration}s fps=${fps} → ${totalFrames} frames`);

for (let i = 0; i < totalFrames; i++) {
  const t = i / fps;
  // seek() must be synchronous and idempotent: set every animated property purely from t.
  await page.evaluate((tt) => window.__hf.seek(tt), t);
  // settle: two rAFs guarantees the style/layout from seek() is committed before capture.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const n = String(i + 1).padStart(5, '0');
  await page.screenshot({ path: resolve(framesDir, `frame-${n}.png`), animations: 'disabled' });
}
console.log(`[render] wrote ${totalFrames} PNG frames → ${framesDir}/`);

await context.close();
await browser.close();

if (makeVideo) {
  const out = resolve(outDir, 'scene.mp4');
  console.log(`[render] encoding ${out}`);
  const r = spawnSync('ffmpeg', [
    '-y',
    '-framerate', String(fps),
    '-i', resolve(framesDir, 'frame-%05d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '18',
    out,
  ], { stdio: 'inherit' });
  if (r.status !== 0) { console.error('[render] ffmpeg failed'); process.exit(r.status ?? 1); }
  console.log(`[render] wrote ${out}`);
}
