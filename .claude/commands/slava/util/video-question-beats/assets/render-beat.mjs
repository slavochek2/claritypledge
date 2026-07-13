// Render ONE question lower-third card to a transparent alpha PNG via headless Chrome.
// The card element is screenshotted with omitBackground:true so the PNG has a real
// alpha channel (NOT record.mjs's opaque webm). Motion is added later in ffmpeg.
//   node render-beat.mjs <html> <out.png> --question "text" [--pw PATH]
// Prints the captured card's pixel dimensions as "WxH" on stdout (last line) so the
// caller can position + slide it. Wrap a word in *asterisks* for Playfair italic.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

function arg(name, def=''){ const i=process.argv.indexOf(name); return i>=0 ? process.argv[i+1] : def; }
const htmlPath = resolve(process.argv[2]);
const outPng   = resolve(process.argv[3]);
const pwPath   = arg('--pw');

const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const fmt = s => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

const pwMod = await import(pwPath ? pathToFileURL(pwPath).href : 'playwright-core');
const chromium = (pwMod.chromium ?? pwMod.default?.chromium);
if (!chromium) { console.error('could not resolve chromium from playwright-core'); process.exit(3); }

const browser = await chromium.launch({ channel:'chrome', headless:true,
  args:['--force-device-scale-factor=1','--hide-scrollbars'] });
// omitBackground needs a context whose default background is transparent
const ctx = await browser.newContext({ viewport:{ width:1920, height:1080 } });
const p = await ctx.newPage();
await p.goto(pathToFileURL(htmlPath).href);
await p.evaluate(({question}) => {
  const el = document.getElementById('question');
  if (el && question) el.innerHTML = question;
}, { question: fmt(arg('--question')) });
// fonts must be ready or the bounding box measures wrong
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(120);
const card = p.locator('#beat');
const box = await card.boundingBox();
if (!box) { console.error('card element not found'); process.exit(4); }
await card.screenshot({ path: outPng, omitBackground: true, type: 'png' });
await ctx.close();
await browser.close();
console.log(`${Math.round(box.width)}x${Math.round(box.height)}`);
