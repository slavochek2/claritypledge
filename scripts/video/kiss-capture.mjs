// KISS test — Stage 1: capture ~10s of the live /program page with Playwright.
// Records the real React SPA UI to a webm, then we transcode to mp4 in the shell.
// Usage: node scripts/video/kiss-capture.mjs [url] [outDir]
import { chromium } from 'playwright';

const url = process.argv[2] || 'https://claritypledge.com/program';
const outDir = process.argv[3] || 'tmp/video-kiss';
const WIDTH = 1920;
const HEIGHT = 1080;
const DURATION_MS = 10_000;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  recordVideo: { dir: outDir, size: { width: WIDTH, height: HEIGHT } },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

console.log(`[capture] navigating to ${url}`);
await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });

// The SPA route lazy-loads — wait for real content (not the loading spinner)
// before recording, else the clip opens on a spinner.
await page.getByText('WEEK 1', { exact: false }).first().waitFor({ timeout: 30_000 });
await page.waitForTimeout(800); // let layout settle

// Slow scroll down the program timeline so the capture has motion, not a static frame.
const start = Date.now();
let y = 0;
while (Date.now() - start < DURATION_MS) {
  y += 120;
  await page.evaluate((py) => window.scrollTo({ top: py, behavior: 'smooth' }), y);
  await page.waitForTimeout(400);
}

await context.close(); // flushes the video file
await browser.close();
console.log(`[capture] video written to ${outDir}/`);
