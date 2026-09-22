// Render every top-level element with an id in an HTML file to <id>.png (transparent background).
// Usage: node render.mjs <cards.html> <outDir>
// Uses the repo's playwright-core + system Chrome, same as /video-brand-pass. Fails if the Inter
// font or any <img> did not load — a silent fallback font or broken icon is not a render.
import { createRequire } from 'module'; import { execSync } from 'child_process';
import { fileURLToPath } from 'url'; import fs from 'fs'; import path from 'path';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.CP_ROOT || execSync('git rev-parse --show-toplevel', { cwd: here }).toString().trim();
const { chromium } = createRequire(path.join(root, 'tools/kanban/'))('playwright-core');
const [html, out] = process.argv.slice(2);
if (!html || !out) { console.error('usage: node render.mjs <cards.html> <outDir>'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ channel: 'chrome' });
try {
  const p = await b.newPage({ viewport: { width: 1400, height: 800 } });
  await p.goto('file://' + path.resolve(html), { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  const bad = await p.evaluate(() => [
    ...(document.fonts.check('600 26px Inter') ? [] : ['font Inter not loaded']),
    ...[...document.images].filter(i => !i.naturalWidth).map(i => 'image not loaded: ' + i.getAttribute('src'))]);
  if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
  const ids = await p.$$eval('body > [id]', els => els.map(e => e.id));
  for (const id of ids) {
    const el = await p.$(`[id="${id.replace(/"/g, '\\"')}"]`);
    await el.screenshot({ path: path.join(out, id + '.png'), omitBackground: true });
  }
  console.log('rendered', ids.join(' '));
} finally { await b.close(); }
